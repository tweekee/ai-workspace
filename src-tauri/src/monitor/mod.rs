pub mod hooks;
pub mod model;
mod process;
use axum::{
    body::{to_bytes, Body},
    extract::State,
    http::{HeaderValue, Method, Request, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Json, Router,
};
use model::{now, Activity, Observation, Registry, Session};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use subtle::ConstantTimeEq;
use sysinfo::System;

pub const PORT: u16 = 38471;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserCredential {
    id: String,
    origin: String,
    token: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Credentials {
    version: u32,
    port: u16,
    hook_token: String,
    browsers: Vec<BrowserCredential>,
}
struct Pairing {
    code: String,
    expires: u64,
    attempts: u32,
}
struct Inner {
    registry: Registry,
    credentials: Credentials,
    pairing: Option<Pairing>,
    system: System,
    error: Option<String>,
    requests: Vec<u64>,
    last_tick: u64,
}
#[derive(Clone)]
pub struct Monitor {
    inner: Arc<Mutex<Inner>>,
    folder: PathBuf,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub bridge: BridgeStatus,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    pub listening: bool,
    pub port: u16,
    pub paired_browsers: usize,
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairCode {
    pub code: String,
    pub expires_at: u64,
    pub port: u16,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PairRequest {
    code: String,
    client_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BrowserRequest {
    observations: Vec<Observation>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HookRequest {
    observation: Observation,
    reporter_pid: u32,
    project: Option<String>,
}
fn random_hex(bytes: usize) -> Result<String, String> {
    let mut b = vec![0; bytes];
    getrandom::fill(&mut b).map_err(|_| "Secure randomness unavailable")?;
    Ok(b.iter().map(|v| format!("{v:02x}")).collect())
}
fn equal(a: &str, b: &str) -> bool {
    a.as_bytes().ct_eq(b.as_bytes()).into()
}
fn extension_origin(origin: &str) -> bool {
    origin
        .strip_prefix("chrome-extension://")
        .is_some_and(|id| id.len() == 32 && id.bytes().all(|b| (b'a'..=b'p').contains(&b)))
}
fn safe_client_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
}
fn persist(folder: &Path, credentials: &Credentials) -> Result<(), String> {
    fs::create_dir_all(folder).map_err(|_| "Cannot create monitoring configuration")?;
    let path = folder.join("bridge-credentials.json");
    let temp = folder.join("bridge-credentials.tmp");
    fs::write(
        &temp,
        serde_json::to_vec(credentials).map_err(|_| "Cannot encode bridge credentials")?,
    )
    .map_err(|_| "Cannot save bridge credentials")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))
            .map_err(|_| "Cannot restrict bridge credentials")?;
    }
    crate::storage::commit_file(&temp, &path).map_err(|_| "Cannot commit bridge credentials")?;
    Ok(())
}
impl Monitor {
    pub fn start(folder: PathBuf) -> Result<Self, String> {
        let credentials = fs::read(folder.join("bridge-credentials.json"))
            .ok()
            .and_then(|b| {
                if b.len() > 32768 {
                    return None;
                }
                serde_json::from_slice::<Credentials>(&b).ok()
            })
            .filter(|c| {
                c.version == 1
                    && c.port == PORT
                    && c.hook_token.len() == 64
                    && c.browsers.len() <= 8
                    && c.browsers.iter().all(|b| {
                        extension_origin(&b.origin) && safe_client_id(&b.id) && b.token.len() == 64
                    })
            });
        let credentials = match credentials {
            Some(c) => c,
            None => Credentials {
                version: 1,
                port: PORT,
                hook_token: random_hex(32)?,
                browsers: Vec::new(),
            },
        };
        let this = Self {
            folder,
            inner: Arc::new(Mutex::new(Inner {
                registry: Registry::default(),
                credentials,
                pairing: None,
                system: System::new(),
                error: None,
                requests: Vec::new(),
                last_tick: 0,
            })),
        };
        let listener = match TcpListener::bind(("127.0.0.1", PORT)) {
            Ok(l) => l,
            Err(_) => {
                this.inner.lock().unwrap().error = Some(
                    "Local bridge port 38471 is unavailable. Close another AI Workspace instance."
                        .into(),
                );
                return Ok(this);
            }
        };
        let initial_credentials = this.inner.lock().unwrap().credentials.clone();
        if let Err(e) = persist(&this.folder, &initial_credentials) {
            this.inner.lock().unwrap().error = Some(e);
            return Ok(this);
        }
        listener
            .set_nonblocking(true)
            .map_err(|_| "Cannot configure local bridge")?;
        let worker = this.clone();
        std::thread::Builder::new()
            .name("ai-workspace-monitor".into())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_multi_thread()
                    .worker_threads(2)
                    .enable_all()
                    .build();
                let Ok(runtime) = runtime else {
                    worker.inner.lock().unwrap().error =
                        Some("Cannot start local bridge runtime".into());
                    return;
                };
                runtime.block_on(async move {
                    let ticker = worker.clone();
                    tokio::spawn(async move {
                        loop {
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            ticker.tick();
                        }
                    });
                    let router = Router::new()
                        .fallback(any(handle))
                        .with_state(worker.clone());
                    let listener = match tokio::net::TcpListener::from_std(listener) {
                        Ok(l) => l,
                        Err(_) => {
                            worker.inner.lock().unwrap().error =
                                Some("Cannot start loopback listener".into());
                            return;
                        }
                    };
                    if axum::serve(listener, router).await.is_err() {
                        worker.inner.lock().unwrap().error =
                            Some("Local bridge stopped unexpectedly".into());
                    }
                });
            })
            .map_err(|_| "Cannot spawn local bridge")?;
        Ok(this)
    }
    fn tick(&self) {
        let mut g = self.inner.lock().unwrap();
        let at = now();
        if at.saturating_sub(g.last_tick) < 1800 {
            return;
        }
        g.last_tick = at;
        let Inner {
            registry, system, ..
        } = &mut *g;
        let owners: Vec<_> = registry.records.values().filter_map(|r| r.owner).collect();
        process::refresh_owners(system, &owners);
        registry.tick(at, |pid, start| process::alive(system, pid, start));
    }
    pub fn snapshot(&self) -> Snapshot {
        self.tick();
        let g = self.inner.lock().unwrap();
        Snapshot {
            sessions: g.registry.snapshot(),
            bridge: BridgeStatus {
                listening: g.error.is_none(),
                port: PORT,
                paired_browsers: g.credentials.browsers.len(),
                error: g.error.clone(),
            },
        }
    }
    pub fn pair_code(&self) -> Result<PairCode, String> {
        let mut g = self.inner.lock().unwrap();
        if let Some(e) = &g.error {
            return Err(e.clone());
        }
        let code = random_hex(4)?.to_uppercase();
        let expires = now() + 120_000;
        g.pairing = Some(Pairing {
            code: code.clone(),
            expires,
            attempts: 0,
        });
        Ok(PairCode {
            code,
            expires_at: expires,
            port: PORT,
        })
    }
    pub fn revoke(&self) -> Result<(), String> {
        let mut g = self.inner.lock().unwrap();
        g.credentials.browsers.clear();
        g.pairing = None;
        for record in g.registry.records.values_mut() {
            if record.session.source == "browser" {
                record.session.state = Activity::Offline;
                record.session.last_activity = now();
            }
        }
        persist(&self.folder, &g.credentials)
    }
    fn dispatch(
        &self,
        path: &str,
        origin: Option<&str>,
        bearer: &str,
        body: &[u8],
    ) -> (StatusCode, Value) {
        let at = now();
        let mut g = self.inner.lock().unwrap();
        g.requests.retain(|t| at.saturating_sub(*t) < 1000);
        if g.requests.len() >= 128 {
            return (StatusCode::TOO_MANY_REQUESTS, json!({"error":"Rate limit"}));
        }
        g.requests.push(at);
        if path == "/v1/pair" {
            let Some(origin) = origin.filter(|o| extension_origin(o)) else {
                return (
                    StatusCode::FORBIDDEN,
                    json!({"error":"Extension origin required"}),
                );
            };
            let Ok(request) = serde_json::from_slice::<PairRequest>(body) else {
                return bad("Invalid pairing payload");
            };
            if !safe_client_id(&request.client_id) || request.code.len() != 8 {
                return bad("Invalid pairing payload");
            }
            let Some(pair) = g.pairing.as_mut() else {
                return (
                    StatusCode::FORBIDDEN,
                    json!({"error":"Open pairing in the desktop app"}),
                );
            };
            pair.attempts += 1;
            if at > pair.expires
                || pair.attempts > 8
                || !equal(&pair.code, &request.code.to_uppercase())
            {
                return (
                    StatusCode::FORBIDDEN,
                    json!({"error":"Pairing code expired or incorrect"}),
                );
            }
            if g.credentials.browsers.len() >= 8
                && !g
                    .credentials
                    .browsers
                    .iter()
                    .any(|b| b.id == request.client_id)
            {
                return bad("Pairing limit reached");
            }
            let Ok(token) = random_hex(32) else {
                return bad("Secure randomness unavailable");
            };
            g.credentials.browsers.retain(|b| b.id != request.client_id);
            g.credentials.browsers.push(BrowserCredential {
                id: request.client_id,
                origin: origin.into(),
                token: token.clone(),
            });
            g.pairing = None;
            if let Err(e) = persist(&self.folder, &g.credentials) {
                g.credentials.browsers.pop();
                return (StatusCode::INTERNAL_SERVER_ERROR, json!({"error":e}));
            }
            return (StatusCode::OK, json!({"token":token,"protocol":1}));
        }
        if path == "/v1/browser" {
            let Some(client) = g
                .credentials
                .browsers
                .iter()
                .find(|b| Some(b.origin.as_str()) == origin && equal(&b.token, bearer))
                .cloned()
            else {
                return (
                    StatusCode::UNAUTHORIZED,
                    json!({"error":"Pair the extension"}),
                );
            };
            let Ok(request) = serde_json::from_slice::<BrowserRequest>(body) else {
                return bad("Invalid observations");
            };
            if request.observations.len() > 64 {
                return bad("Batch limit exceeded");
            }
            for observation in &request.observations {
                if let Err(e) = observation.validate(at, true) {
                    return bad(e);
                }
            }
            let mut accepted = 0;
            for observation in request.observations {
                if g.registry
                    .observe(&client.id, "browser", observation, None, None, at)
                    .is_ok()
                {
                    accepted += 1;
                }
            }
            return (StatusCode::OK, json!({"accepted":accepted}));
        }
        if path == "/v1/hook" {
            if origin.is_some() || !equal(&g.credentials.hook_token, bearer) {
                return (
                    StatusCode::UNAUTHORIZED,
                    json!({"error":"Local hook credential required"}),
                );
            }
            let Ok(request) = serde_json::from_slice::<HookRequest>(body) else {
                return bad("Invalid hook metadata");
            };
            if request.reporter_pid == 0
                || request
                    .project
                    .as_ref()
                    .is_some_and(|s| s.len() > 120 || s.contains(['\\', '/', '\n', '\r']))
            {
                return bad("Invalid hook metadata");
            }
            if let Err(e) = request.observation.validate(at, false) {
                return bad(e);
            }
            let owner = process::resolve_owner(request.reporter_pid, request.observation.provider);
            let result = g.registry.observe(
                "hooks",
                "local",
                request.observation,
                owner,
                request.project,
                at,
            );
            return match result {
                Ok(()) => (StatusCode::OK, json!({"accepted":1})),
                Err(e) => bad(e),
            };
        }
        (StatusCode::NOT_FOUND, json!({"error":"Unknown route"}))
    }
}
fn bad(message: &str) -> (StatusCode, Value) {
    (StatusCode::BAD_REQUEST, json!({"error":message}))
}
async fn handle(State(monitor): State<Monitor>, request: Request<Body>) -> Response {
    let (parts, body) = request.into_parts();
    let origin = parts.headers.get("origin").and_then(|s| s.to_str().ok());
    let cors = origin.filter(|o| extension_origin(o));
    let expected_host = format!("127.0.0.1:{PORT}");
    if parts.headers.get("host").and_then(|s| s.to_str().ok()) != Some(expected_host.as_str()) {
        return reply(
            StatusCode::FORBIDDEN,
            json!({"error":"Invalid loopback host"}),
            None,
        );
    }
    let path = parts.uri.path();
    if parts.method == Method::OPTIONS {
        if cors.is_none() || !["/v1/pair", "/v1/browser"].contains(&path) {
            return reply(StatusCode::FORBIDDEN, json!({}), None);
        }
        return reply(StatusCode::NO_CONTENT, json!(null), cors);
    }
    if parts.method == Method::GET && path == "/v1/snapshot" {
        let bearer = parts
            .headers
            .get("authorization")
            .and_then(|s| s.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .unwrap_or("");
        let authorized = {
            let g = monitor.inner.lock().unwrap();
            origin.is_none() && equal(&g.credentials.hook_token, bearer)
        };
        if !authorized {
            return reply(StatusCode::UNAUTHORIZED, json!({}), None);
        }
        return reply(
            StatusCode::OK,
            serde_json::to_value(monitor.snapshot()).unwrap_or(json!({})),
            None,
        );
    }
    if parts.method == Method::GET && path == "/health" {
        return reply(
            StatusCode::OK,
            json!({"app":"AI Workspace","protocol":1}),
            None,
        );
    }
    if parts.method != Method::POST {
        return reply(StatusCode::METHOD_NOT_ALLOWED, json!({}), cors);
    }
    if parts
        .headers
        .get("content-type")
        .and_then(|s| s.to_str().ok())
        .is_none_or(|s| !s.starts_with("application/json"))
    {
        return reply(StatusCode::UNSUPPORTED_MEDIA_TYPE, json!({}), cors);
    }
    let data = tokio::time::timeout(Duration::from_secs(1), to_bytes(body, 32768)).await;
    let Ok(Ok(data)) = data else {
        return reply(
            StatusCode::PAYLOAD_TOO_LARGE,
            json!({"error":"Request body unavailable or too large"}),
            cors,
        );
    };
    let bearer = parts
        .headers
        .get("authorization")
        .and_then(|s| s.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .unwrap_or("");
    let (status, value) = monitor.dispatch(path, origin, bearer, &data);
    reply(status, value, cors)
}
fn reply(status: StatusCode, value: Value, origin: Option<&str>) -> Response {
    let mut response = (status, Json(value)).into_response();
    response
        .headers_mut()
        .insert("cache-control", HeaderValue::from_static("no-store"));
    if let Some(origin) = origin {
        if let Ok(v) = HeaderValue::from_str(origin) {
            response
                .headers_mut()
                .insert("access-control-allow-origin", v);
        }
        response
            .headers_mut()
            .insert("vary", HeaderValue::from_static("Origin"));
        response.headers_mut().insert(
            "access-control-allow-methods",
            HeaderValue::from_static("POST, OPTIONS"),
        );
        response.headers_mut().insert(
            "access-control-allow-headers",
            HeaderValue::from_static("Authorization, Content-Type"),
        );
        response.headers_mut().insert(
            "access-control-allow-private-network",
            HeaderValue::from_static("true"),
        );
    }
    response
}
pub fn default_folder() -> PathBuf {
    if let Some(path) = std::env::var_os("AI_WORKSPACE_DATA_DIR") {
        return PathBuf::from(path);
    }
    #[cfg(windows)]
    {
        PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default())
            .join("io.github.tweekee.aiworkspace")
    }
    #[cfg(not(windows))]
    {
        PathBuf::from(
            std::env::var_os("XDG_CONFIG_HOME")
                .unwrap_or_else(|| std::env::var_os("HOME").unwrap_or_default()),
        )
        .join("io.github.tweekee.aiworkspace")
    }
}

#[cfg(test)]
mod tests;
