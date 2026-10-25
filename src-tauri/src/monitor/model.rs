use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Chatgpt,
    Claude,
    Gemini,
    Codex,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Activity {
    Offline,
    Idle,
    Thinking,
    Working,
    Waiting,
    Completed,
    Unknown,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Task {
    None,
    Response,
    Reading,
    Editing,
    Terminal,
    Approval,
}
impl Provider {
    pub fn name(self) -> &'static str {
        match self {
            Self::Chatgpt => "ChatGPT",
            Self::Claude => "Claude",
            Self::Gemini => "Gemini",
            Self::Codex => "Codex",
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Observation {
    pub session_id: String,
    pub provider: Provider,
    pub state: Activity,
    pub task: Task,
    pub sequence: u64,
    pub observed_at: u64,
    pub evidence: String,
}
impl Observation {
    pub fn validate(&self, at: u64, browser: bool) -> Result<(), &'static str> {
        if self.session_id.is_empty()
            || self.session_id.len() > 96
            || !self
                .session_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_-:".contains(&b))
        {
            return Err("Invalid session identifier");
        }
        if self.sequence > 9_007_199_254_740_991
            || self.observed_at > at + 10_000
            || at.saturating_sub(self.observed_at) > 45_000
        {
            return Err("Stale observation");
        }
        if browser
            && (self.provider == Provider::Codex
                || ![
                    "visible-stop-control",
                    "visible-composer",
                    "visible-approval",
                    "page-unavailable",
                    "tab-closed",
                    "tab-loading",
                ]
                .contains(&self.evidence.as_str()))
        {
            return Err("Invalid browser evidence");
        }
        if !browser
            && ![
                "SessionStart",
                "SessionEnd",
                "UserPromptSubmit",
                "PreToolUse",
                "PostToolUse",
                "PermissionRequest",
                "Notification",
                "Stop",
                "Interrupt",
                "BeforeAgent",
                "AfterAgent",
                "BeforeTool",
                "AfterTool",
            ]
            .contains(&self.evidence.as_str())
        {
            return Err("Invalid hook evidence");
        }
        if self.state == Activity::Working && self.task == Task::None {
            return Err("Work needs a task category");
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub at: u64,
    pub state: Activity,
    pub task: Task,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub session_id: String,
    pub provider: Provider,
    pub source: String,
    pub state: Activity,
    pub task: Task,
    pub started_at: u64,
    pub last_seen: u64,
    pub last_activity: u64,
    pub sequence: u64,
    pub history: Vec<History>,
    pub evidence: String,
    pub confidence: String,
    pub project: Option<String>,
    pub integration: String,
}
pub struct Record {
    pub session: Session,
    pub owner: Option<(u32, u64)>,
    pub last_sequence: u64,
}
#[derive(Default)]
pub struct Registry {
    pub records: HashMap<String, Record>,
}
impl Registry {
    pub fn observe(
        &mut self,
        namespace: &str,
        source: &str,
        o: Observation,
        owner: Option<(u32, u64)>,
        project: Option<String>,
        at: u64,
    ) -> Result<(), &'static str> {
        o.validate(at, source == "browser")?;
        let id = format!("{}:{}:{}", source, namespace, o.session_id);
        if let Some(old) = self.records.get(&id) {
            if old.session.provider != o.provider {
                return Err("Provider identity changed");
            }
            if o.sequence <= old.last_sequence || o.observed_at < old.session.last_seen {
                return Err("Replay rejected");
            }
        }
        if !self.records.contains_key(&id) {
            if o.state == Activity::Offline {
                return Ok(());
            }
            if self.records.len() >= 128 {
                return Err("Session limit reached");
            }
            self.records.insert(
                id.clone(),
                Record {
                    session: Session {
                        id: id.clone(),
                        session_id: o.session_id.clone(),
                        provider: o.provider,
                        source: source.into(),
                        state: Activity::Unknown,
                        task: Task::None,
                        started_at: at,
                        last_seen: 0,
                        last_activity: at,
                        sequence: 0,
                        history: Vec::new(),
                        evidence: o.evidence.clone(),
                        confidence: if source == "browser" || owner.is_some() {
                            "observed"
                        } else {
                            "limited-liveness"
                        }
                        .into(),
                        project: project.clone(),
                        integration: format!(
                            "{}-{}",
                            o.provider.name().to_lowercase(),
                            if source == "browser" { "dom" } else { "hooks" }
                        ),
                    },
                    owner,
                    last_sequence: 0,
                },
            );
        }
        let r = self.records.get_mut(&id).unwrap();
        if r.session.state == Activity::Offline && o.state != Activity::Offline {
            r.session.started_at = at;
        }
        r.last_sequence = o.sequence;
        r.session.sequence += 1;
        r.session.last_seen = o.observed_at;
        r.session.evidence = o.evidence;
        if project.is_some() {
            r.session.project = project;
        }
        if owner.is_some() {
            r.owner = owner;
            r.session.confidence = "observed".into();
        }
        change(&mut r.session, o.state, o.task, at);
        Ok(())
    }
    pub fn tick(&mut self, at: u64, mut alive: impl FnMut(u32, u64) -> bool) {
        for r in self.records.values_mut() {
            let age = at.saturating_sub(r.session.last_seen);
            if r.session.state == Activity::Offline {
                continue;
            }
            if r.session.source == "browser" {
                if age > 75_000 {
                    r.session.evidence = "browser-heartbeat-lost".into();
                    change(&mut r.session, Activity::Offline, Task::None, at);
                }
            } else if let Some((pid, start)) = r.owner {
                if !alive(pid, start) {
                    r.session.evidence = "process-exited".into();
                    change(&mut r.session, Activity::Offline, Task::None, at);
                }
            } else if age > 120_000 {
                r.session.evidence = "hook-liveness-lost".into();
                change(&mut r.session, Activity::Offline, Task::None, at);
            } else if age > 45_000 {
                change(&mut r.session, Activity::Unknown, Task::None, at);
            }
            if r.session.state == Activity::Completed
                && at.saturating_sub(r.session.last_activity) > 3000
            {
                change(&mut r.session, Activity::Idle, Task::None, at);
            }
        }
        self.records.retain(|_, r| {
            r.session.state != Activity::Offline
                || at.saturating_sub(r.session.last_activity) < 60_000
        });
    }
    pub fn snapshot(&self) -> Vec<Session> {
        let mut s: Vec<_> = self.records.values().map(|r| r.session.clone()).collect();
        s.sort_by_key(|a| a.started_at);
        s
    }
}
fn change(s: &mut Session, state: Activity, task: Task, at: u64) {
    if s.state != state || s.task != task {
        s.state = state;
        s.task = task;
        s.last_activity = at;
        s.history.insert(0, History { at, state, task });
        s.history.truncate(50);
    }
}
