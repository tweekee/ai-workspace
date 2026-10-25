use super::model::{Provider, Task};
use super::*;
use axum::body::Body;
use tempfile::TempDir;
fn service() -> (Monitor, TempDir) {
    let folder = tempfile::tempdir().unwrap();
    let monitor = Monitor {
        folder: folder.path().to_path_buf(),
        inner: Arc::new(Mutex::new(Inner {
            registry: Registry::default(),
            credentials: Credentials {
                version: 1,
                port: PORT,
                hook_token: "a".repeat(64),
                browsers: Vec::new(),
            },
            pairing: None,
            system: System::new(),
            error: None,
            requests: Vec::new(),
            last_tick: 0,
        })),
    };
    (monitor, folder)
}
fn observation(id: &str, state: Activity, at: u64) -> Observation {
    Observation {
        session_id: id.into(),
        provider: Provider::Chatgpt,
        state,
        task: if state == Activity::Working {
            Task::Response
        } else {
            Task::None
        },
        sequence: at,
        observed_at: at,
        evidence: "visible-composer".into(),
    }
}
fn origin() -> String {
    format!("chrome-extension://{}", "a".repeat(32))
}
#[test]
fn browser_requires_explicit_pairing() {
    let (m, _) = service();
    let payload = serde_json::to_vec(&json!({"observations":[]})).unwrap();
    assert_eq!(
        m.dispatch("/v1/browser", Some(&origin()), "", &payload).0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        m.dispatch(
            "/v1/pair",
            Some("https://chatgpt.com"),
            "",
            &serde_json::to_vec(&json!({"code":"12345678","clientId":"client"})).unwrap()
        )
        .0,
        StatusCode::FORBIDDEN
    );
}
#[test]
fn pair_is_single_use_and_tokens_are_bound_to_origin() {
    let (m, _) = service();
    let code = m.pair_code().unwrap();
    let body = serde_json::to_vec(&json!({"code":code.code,"clientId":"client-a"})).unwrap();
    let (status, result) = m.dispatch("/v1/pair", Some(&origin()), "", &body);
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        m.dispatch("/v1/pair", Some(&origin()), "", &body).0,
        StatusCode::FORBIDDEN
    );
    let payload =
        serde_json::to_vec(&json!({"observations":[observation("tab-1",Activity::Idle,now())]}))
            .unwrap();
    assert_eq!(
        m.dispatch(
            "/v1/browser",
            Some(&origin()),
            result["token"].as_str().unwrap(),
            &payload
        )
        .0,
        StatusCode::OK
    );
    assert_eq!(
        m.dispatch(
            "/v1/browser",
            Some(&format!("chrome-extension://{}", "b".repeat(32))),
            result["token"].as_str().unwrap(),
            &payload
        )
        .0,
        StatusCode::UNAUTHORIZED
    );
}
#[test]
fn pairing_lockout_and_expiry() {
    let (m, _) = service();
    let code = m.pair_code().unwrap();
    let wrong = serde_json::to_vec(&json!({"code":"ZZZZZZZZ","clientId":"client"})).unwrap();
    for _ in 0..9 {
        assert_eq!(
            m.dispatch("/v1/pair", Some(&origin()), "", &wrong).0,
            StatusCode::FORBIDDEN
        );
    }
    let right = serde_json::to_vec(&json!({"code":code.code,"clientId":"client"})).unwrap();
    assert_eq!(
        m.dispatch("/v1/pair", Some(&origin()), "", &right).0,
        StatusCode::FORBIDDEN
    );
    m.pair_code().unwrap();
    m.inner.lock().unwrap().pairing.as_mut().unwrap().expires = 0;
    assert_eq!(
        m.dispatch("/v1/pair", Some(&origin()), "", &right).0,
        StatusCode::FORBIDDEN
    );
}
#[test]
fn local_hook_cannot_be_called_from_web_origins() {
    let (m, _) = service();
    assert_eq!(
        m.dispatch(
            "/v1/hook",
            Some("https://chatgpt.com"),
            &"a".repeat(64),
            b"{}"
        )
        .0,
        StatusCode::UNAUTHORIZED
    );
}
#[test]
fn lifecycle_rejects_old_and_replayed_events() {
    let mut registry = Registry::default();
    let at = now();
    registry
        .observe(
            "browser-a",
            "browser",
            observation("tab-1", Activity::Idle, at),
            None,
            None,
            at,
        )
        .unwrap();
    assert!(registry
        .observe(
            "browser-a",
            "browser",
            observation("tab-1", Activity::Working, at),
            None,
            None,
            at
        )
        .is_err());
    assert!(registry
        .observe(
            "browser-a",
            "browser",
            observation("old", Activity::Idle, at - 60_000),
            None,
            None,
            at
        )
        .is_err());
    assert_eq!(registry.snapshot().len(), 1);
}
#[test]
fn distinct_browsers_and_tabs_never_collapse() {
    let mut r = Registry::default();
    let at = now();
    for client in ["a", "b"] {
        for id in ["tab-1", "tab-2"] {
            r.observe(
                client,
                "browser",
                observation(id, Activity::Idle, at),
                None,
                None,
                at,
            )
            .unwrap();
        }
    }
    assert_eq!(r.snapshot().len(), 4);
}
#[test]
fn browser_shutdown_and_retention_cleanup() {
    let mut r = Registry::default();
    let at = now();
    r.observe(
        "a",
        "browser",
        observation("tab", Activity::Working, at),
        None,
        None,
        at,
    )
    .unwrap();
    r.tick(at + 75_001, |_, _| true);
    assert_eq!(r.snapshot()[0].state, Activity::Offline);
    r.tick(at + 135_002, |_, _| true);
    assert!(r.snapshot().is_empty());
}
#[test]
fn process_exit_cleans_up_local_session() {
    let mut r = Registry::default();
    let at = now();
    let mut o = observation("cli", Activity::Working, at);
    o.provider = Provider::Codex;
    o.evidence = "PreToolUse".into();
    r.observe("hooks", "local", o, Some((123, 456)), None, at)
        .unwrap();
    r.tick(at + 1, |pid, start| pid == 123 && start == 999);
    assert_eq!(r.snapshot()[0].state, Activity::Offline);
}
#[test]
fn missing_process_binding_is_explicitly_limited() {
    let mut r = Registry::default();
    let at = now();
    let mut o = observation("cli", Activity::Working, at);
    o.provider = Provider::Codex;
    o.evidence = "PreToolUse".into();
    r.observe("hooks", "local", o, None, None, at).unwrap();
    assert_eq!(r.snapshot()[0].confidence, "limited-liveness");
    r.tick(at + 45_001, |_, _| true);
    assert_eq!(r.snapshot()[0].state, Activity::Unknown);
    r.tick(at + 120_001, |_, _| true);
    assert_eq!(r.snapshot()[0].state, Activity::Offline);
}
#[test]
fn hook_payloads_are_reduced_to_metadata() {
    for provider in [Provider::Codex, Provider::Claude, Provider::Gemini] {
        let input = json!({"session_id":"session-1","hook_event_name":"PreToolUse","tool_name":"run_shell_command","prompt":"PRIVATE PROMPT","tool_input":{"command":"PRIVATE COMMAND"},"cwd":"C:/private-parent/repo","transcript_path":"C:/never-open-this-private-transcript"});
        let (o, project) = hooks::classify(&input, provider).unwrap();
        assert_eq!(o.state, Activity::Working);
        assert_eq!(o.task, Task::Terminal);
        assert_eq!(project.as_deref(), Some("repo"));
        let encoded = serde_json::to_string(&o).unwrap();
        assert!(!encoded.contains("PRIVATE"));
        assert!(!encoded.contains("private-parent"));
        assert!(!encoded.contains("transcript"));
    }
}
#[test]
fn all_cli_lifecycle_categories_are_supported() {
    for (event, state) in [
        ("SessionStart", Activity::Idle),
        ("UserPromptSubmit", Activity::Thinking),
        ("BeforeAgent", Activity::Thinking),
        ("PermissionRequest", Activity::Waiting),
        ("Stop", Activity::Completed),
        ("AfterAgent", Activity::Completed),
        ("SessionEnd", Activity::Offline),
    ] {
        let (o, _) = hooks::classify(
            &json!({"session_id":"s","hook_event_name":event}),
            Provider::Codex,
        )
        .unwrap();
        assert_eq!(o.state, state);
    }
    assert!(hooks::classify(
        &json!({"session_id":"s","hook_event_name":"unrecognized"}),
        Provider::Claude
    )
    .is_none());
}
#[test]
fn hook_install_preserves_existing_settings_and_is_idempotent() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir(dir.path().join(".claude")).unwrap();
    let old = json!({"permissions":{"allow":["Read"]},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo existing"}]}]}});
    fs::write(
        dir.path().join(".claude/settings.local.json"),
        serde_json::to_vec(&old).unwrap(),
    )
    .unwrap();
    for _ in 0..2 {
        hooks::install(
            dir.path(),
            &[Provider::Codex, Provider::Claude, Provider::Gemini],
            Path::new("C:/app/ai-workspace.exe"),
        )
        .unwrap();
    }
    let settings: Value =
        serde_json::from_slice(&fs::read(dir.path().join(".claude/settings.local.json")).unwrap())
            .unwrap();
    let gemini: Value =
        serde_json::from_slice(&fs::read(dir.path().join(".gemini/settings.json")).unwrap())
            .unwrap();
    assert_eq!(
        gemini["hooks"]["BeforeTool"][0]["hooks"][0]["timeout"],
        3000
    );
    let codex: Value =
        serde_json::from_slice(&fs::read(dir.path().join(".codex/hooks.json")).unwrap()).unwrap();
    assert_eq!(codex["hooks"]["PreToolUse"][0]["hooks"][0]["timeout"], 3);
    assert!(codex["hooks"].get("Notification").is_none());
    assert_eq!(settings["permissions"], old["permissions"]);
    assert_eq!(settings["hooks"]["Stop"].as_array().unwrap().len(), 2);
    assert!(dir
        .path()
        .join(".claude/settings.local.json.ai-workspace-backup")
        .exists());
}
#[test]
fn extra_fields_and_invalid_browser_evidence_are_rejected() {
    assert!(
        serde_json::from_value::<BrowserRequest>(json!({"observations":[],"chat":"PRIVATE"}))
            .is_err()
    );
    let mut o = observation("t", Activity::Working, now());
    o.evidence = "internal-model-thought".into();
    assert!(o.validate(now(), true).is_err());
}
#[tokio::test]
async fn http_rejects_rebinding_and_large_payloads() {
    let (m, _) = service();
    let r = Request::builder()
        .uri("/health")
        .header("host", "evil.example")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        handle(State(m.clone()), r).await.status(),
        StatusCode::FORBIDDEN
    );
    let r = Request::builder()
        .method("POST")
        .uri("/v1/pair")
        .header("host", format!("127.0.0.1:{PORT}"))
        .header("content-type", "application/json")
        .header("origin", origin())
        .body(Body::from(vec![b'x'; 32769]))
        .unwrap();
    assert_eq!(
        handle(State(m), r).await.status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
}
#[tokio::test]
async fn http_cors_never_allows_websites() {
    let (m, _) = service();
    let r = Request::builder()
        .method("OPTIONS")
        .uri("/v1/pair")
        .header("host", format!("127.0.0.1:{PORT}"))
        .header("origin", "https://chatgpt.com")
        .body(Body::empty())
        .unwrap();
    let response = handle(State(m), r).await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    assert!(!response
        .headers()
        .contains_key("access-control-allow-origin"));
}
