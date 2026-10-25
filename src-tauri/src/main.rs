#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--report-hook") {
        let provider = match args.get(2).map(String::as_str) {
            Some("codex") => ai_workspace_lib::monitor::model::Provider::Codex,
            Some("claude") => ai_workspace_lib::monitor::model::Provider::Claude,
            Some("gemini") => ai_workspace_lib::monitor::model::Provider::Gemini,
            _ => std::process::exit(2),
        };
        ai_workspace_lib::report_hook(provider);
        return;
    }
    if args.get(1).map(String::as_str) == Some("--monitor-server") {
        let monitor =
            ai_workspace_lib::monitor::Monitor::start(ai_workspace_lib::monitor::default_folder())
                .expect("Cannot start local monitor");
        let code = monitor.pair_code().expect("Bridge unavailable");
        println!(
            "{}",
            serde_json::json!({"port":code.port,"pairCode":code.code})
        );
        loop {
            std::thread::park();
        }
    }
    ai_workspace_lib::run()
}
