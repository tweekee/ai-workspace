use std::{fs, io, path::Path};
/// Prefer atomic replacement. Some Windows filesystem projections allow normal
/// writes but reject rename; keep the staged file until the same-path copy succeeds.
pub fn commit_file(temporary: &Path, destination: &Path) -> io::Result<()> {
    match fs::rename(temporary, destination) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {
            fs::copy(temporary, destination)?;
            let _ = fs::remove_file(temporary);
            Ok(())
        }
        Err(error) => Err(error),
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn staged_replacement_can_be_read_and_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("settings.json");
        let temp = dir.path().join("settings.tmp");
        std::fs::write(&temp, b"first").unwrap();
        super::commit_file(&temp, &file).unwrap();
        std::fs::write(&temp, b"second").unwrap();
        super::commit_file(&temp, &file).unwrap();
        assert_eq!(std::fs::read(file).unwrap(), b"second");
    }
}
