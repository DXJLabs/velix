pub fn is_expired(deadline: u64, now: u64) -> bool {
    deadline != 0 && now >= deadline
}
