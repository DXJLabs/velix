export function createDealInviteLink(baseUrl, inviteCode) {
  return `${baseUrl}/${inviteCode}`;
}

export function starkIdentityName(name, fallback = "bob.stark") {
  return String(name || fallback).toLowerCase().endsWith(".stark")
    ? String(name || fallback).toLowerCase()
    : `${String(name || "bob").toLowerCase()}.stark`;
}
