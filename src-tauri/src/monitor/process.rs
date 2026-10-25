use super::model::Provider;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
/// Only this hook's ancestor chain is inspected. Command-line metadata lives in
/// a short-lived System instance and is dropped before returning.
pub fn resolve_owner(mut pid: u32, provider: Provider) -> Option<(u32, u64)> {
    let mut system = System::new();
    for _ in 0..8 {
        let id = Pid::from_u32(pid);
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[id]),
            true,
            ProcessRefreshKind::nothing(),
        );
        let name = system.process(id)?.name().to_string_lossy().to_lowercase();
        let named = match provider {
            Provider::Codex => name == "codex.exe" || name == "codex",
            Provider::Claude => name == "claude.exe" || name == "claude",
            Provider::Gemini => name == "gemini.exe" || name == "gemini",
            _ => false,
        };
        if named {
            return system.process(id).map(|p| (pid, p.start_time()));
        }
        if name == "node.exe" || name == "node" {
            system.refresh_processes_specifics(
                ProcessesToUpdate::Some(&[id]),
                true,
                ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always),
            );
            let p = system.process(id)?;
            let matches = p.cmd().iter().take(3).any(|arg| {
                let s = arg.to_string_lossy().replace('\\', "/").to_lowercase();
                match provider {
                    Provider::Claude => s.contains("@anthropic-ai/claude-code/"),
                    Provider::Gemini => s.contains("@google/gemini-cli/"),
                    _ => false,
                }
            });
            if matches {
                return Some((pid, p.start_time()));
            }
        }
        pid = system.process(id)?.parent()?.as_u32();
    }
    None
}
pub fn refresh_owners(system: &mut System, owners: &[(u32, u64)]) {
    let ids: Vec<_> = owners.iter().map(|(pid, _)| Pid::from_u32(*pid)).collect();
    if !ids.is_empty() {
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&ids),
            true,
            ProcessRefreshKind::nothing(),
        );
    }
}
pub fn alive(system: &System, pid: u32, start: u64) -> bool {
    system
        .process(Pid::from_u32(pid))
        .is_some_and(|p| p.start_time() == start)
}
