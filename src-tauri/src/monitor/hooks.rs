use super::model::{now, Activity, Observation, Provider, Task};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::Duration,
};

pub fn classify(input: &Value, provider: Provider) -> Option<(Observation, Option<String>)> {
    let session = input.get("session_id")?.as_str()?;
    if session.is_empty() || session.len() > 256 {
        return None;
    }
    let event = input.get("hook_event_name")?.as_str()?;
    let tool = input
        .get("tool_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    let task = if ["bash", "shell", "terminal", "exec_command"]
        .iter()
        .any(|s| tool.contains(s))
    {
        Task::Terminal
    } else if ["edit", "write", "apply_patch"]
        .iter()
        .any(|s| tool.contains(s))
    {
        Task::Editing
    } else if ["read", "grep", "glob", "search"]
        .iter()
        .any(|s| tool.contains(s))
    {
        Task::Reading
    } else {
        Task::Response
    };
    let (state, task) = match event {
        "SessionStart" => (Activity::Idle, Task::None),
        "SessionEnd" => (Activity::Offline, Task::None),
        "UserPromptSubmit" | "BeforeAgent" => (Activity::Thinking, Task::Response),
        "PreToolUse" | "BeforeTool" => (Activity::Working, task),
        "PostToolUse" | "AfterTool" => (Activity::Thinking, Task::Response),
        "PermissionRequest" => (Activity::Waiting, Task::Approval),
        "Notification"
            if matches!(
                input.get("notification_type").and_then(Value::as_str),
                Some("permission_prompt" | "ToolPermission")
            ) =>
        {
            (Activity::Waiting, Task::Approval)
        }
        "Notification"
            if input.get("notification_type").and_then(Value::as_str) == Some("idle_prompt") =>
        {
            (Activity::Waiting, Task::None)
        }
        "Stop" | "AfterAgent" => (Activity::Completed, Task::None),
        "Interrupt" => (Activity::Idle, Task::None),
        _ => return None,
    };
    let hash = format!("{:x}", Sha256::digest(session.as_bytes()));
    let at = now();
    // Only the project folder's basename leaves the hook process. No transcript is opened.
    let project = input
        .get("cwd")
        .and_then(Value::as_str)
        .and_then(|s| s.rsplit(['/', '\\']).find(|p| !p.is_empty()))
        .map(|s| s.chars().take(100).collect());
    Some((
        Observation {
            session_id: format!("{}-{}", provider.name().to_lowercase(), &hash[..24]),
            provider,
            state,
            task,
            sequence: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_micros() as u64,
            observed_at: at,
            evidence: event.into(),
        },
        project,
    ))
}
pub fn report(provider: Provider, data_dir: PathBuf) {
    let _ = report_inner(provider, &data_dir);
    // Advisory hooks never block, approve, inject context or request inference.
    let _ = std::io::stdout().write_all(b"{}");
}
fn report_inner(provider: Provider, data_dir: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let mut bytes = Vec::new();
    std::io::stdin().take(1_048_577).read_to_end(&mut bytes)?;
    if bytes.len() > 1_048_576 {
        return Ok(());
    }
    let input: Value = serde_json::from_slice(&bytes)?;
    let Some((observation, project)) = classify(&input, provider) else {
        return Ok(());
    };
    let credentials: Value =
        serde_json::from_slice(&fs::read(data_dir.join("bridge-credentials.json"))?)?;
    let port = credentials["port"]
        .as_u64()
        .filter(|p| *p == 38471)
        .ok_or("Invalid bridge port")? as u16;
    let token = credentials["hookToken"]
        .as_str()
        .filter(|s| s.len() == 64)
        .ok_or("Missing hook credential")?;
    let body = serde_json::to_vec(
        &serde_json::json!({"observation":observation,"reporterPid":std::process::id(),"project":project}),
    )?;
    let address: SocketAddr = format!("127.0.0.1:{port}").parse()?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(300))?;
    stream.set_write_timeout(Some(Duration::from_millis(500)))?;
    stream.set_read_timeout(Some(Duration::from_millis(500)))?;
    write!(stream,"POST /v1/hook HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len())?;
    stream.write_all(&body)?;
    let mut response = [0; 256];
    let _ = stream.read(&mut response);
    Ok(())
}
pub fn install(
    project: &Path,
    providers: &[Provider],
    executable: &Path,
) -> Result<Vec<String>, String> {
    if !project.is_absolute() || !project.is_dir() {
        return Err("Choose an existing absolute project folder".into());
    }
    let project = project
        .canonicalize()
        .map_err(|_| "Cannot resolve project folder")?;
    let exe = executable
        .to_string_lossy()
        .trim_start_matches("\\\\?\\")
        .replace('\\', "/")
        .replace('\'', "''");
    let mut written = Vec::new();
    for provider in providers {
        let (folder, file, events): (&str, &str, &[&str]) = match provider {
            Provider::Codex => (
                ".codex",
                "hooks.json",
                &[
                    "SessionStart",
                    "UserPromptSubmit",
                    "PreToolUse",
                    "PostToolUse",
                    "PermissionRequest",
                    "Stop",
                    "Interrupt",
                    "SessionEnd",
                ],
            ),
            Provider::Claude => (
                ".claude",
                "settings.local.json",
                &[
                    "SessionStart",
                    "UserPromptSubmit",
                    "PreToolUse",
                    "PostToolUse",
                    "PermissionRequest",
                    "Notification",
                    "Stop",
                    "SessionEnd",
                ],
            ),
            Provider::Gemini => (
                ".gemini",
                "settings.json",
                &[
                    "SessionStart",
                    "BeforeAgent",
                    "BeforeTool",
                    "AfterTool",
                    "Notification",
                    "AfterAgent",
                    "SessionEnd",
                ],
            ),
            _ => return Err("Unsupported CLI provider".into()),
        };
        let dir = project.join(folder);
        if fs::symlink_metadata(&dir).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Hook folder cannot be a symlink".into());
        }
        fs::create_dir_all(&dir).map_err(|_| "Cannot create project hook folder")?;
        let target = dir.join(file);
        if fs::symlink_metadata(&target).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err("Hook file cannot be a symlink".into());
        }
        let previous = if target.exists() {
            let b = fs::read(&target).map_err(|_| "Cannot read existing hook settings")?;
            if b.len() > 1_048_576 {
                return Err("Hook settings are too large".into());
            }
            Some(b)
        } else {
            None
        };
        let mut value: Value = previous
            .as_ref()
            .map(|b| serde_json::from_slice(b))
            .transpose()
            .map_err(|_| "Existing hook settings are invalid JSON; not changed")?
            .unwrap_or_else(|| serde_json::json!({}));
        let object = value
            .as_object_mut()
            .ok_or("Existing settings must be an object")?;
        let hooks = object
            .entry("hooks")
            .or_insert_with(|| serde_json::json!({}))
            .as_object_mut()
            .ok_or("Existing hooks must be an object")?;
        let name = provider.name().to_lowercase();
        let command = format!(
            "powershell.exe -NoProfile -NonInteractive -Command \"& '{exe}' --report-hook {name}\""
        );
        for event in events {
            let entries = hooks
                .entry(*event)
                .or_insert_with(|| serde_json::json!([]))
                .as_array_mut()
                .ok_or("Existing hook event must be an array")?;
            entries.retain(|entry| {
                !entry["hooks"].as_array().is_some_and(|a| {
                    a.iter().any(|h| {
                        h["command"].as_str().is_some_and(|c| {
                            c.contains("--report-hook")
                                && c.to_ascii_lowercase().contains("ai-workspace")
                        })
                    })
                })
            });
            entries.push(
                serde_json::json!({"hooks":[{"type":"command","command":command,"timeout":if *provider == Provider::Gemini { 3000 } else { 3 }}]}),
            );
        }
        if let Some(bytes) = previous {
            fs::write(dir.join(format!("{file}.ai-workspace-backup")), bytes)
                .map_err(|_| "Cannot back up previous settings")?;
        }
        let temporary = dir.join(format!("{file}.ai-workspace-tmp"));
        fs::write(
            &temporary,
            serde_json::to_vec_pretty(&value).map_err(|_| "Cannot encode hooks")?,
        )
        .map_err(|_| "Cannot write hook settings")?;
        crate::storage::commit_file(&temporary, &target)
            .map_err(|_| "Cannot save hook settings")?;
        written.push(target.display().to_string());
    }
    Ok(written)
}
