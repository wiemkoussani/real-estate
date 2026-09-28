export function displayPersonName(fullName: string | null | undefined, email: string | null | undefined) {
  const given = (fullName || "").trim();
  const mail = (email || "").trim();
  const local = (mail.split("@")[0] || "").replace(/[0-9]+/g, "");
  const fromEmail = local.split(/[._-]/).find(Boolean) || "";
  const prettyEmail = fromEmail ? fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1).toLowerCase() : "";
  const givenKey = given.replace(/\s/g, "").toLowerCase();
  const emailKey = local.replace(/[._-]/g, "").toLowerCase();
  if (given && emailKey && !emailKey.includes(givenKey) && given.split(/\s+/).length === 1) {
    return prettyEmail || mail || given;
  }
  return given.split(/\s+/)[0] || prettyEmail || mail || "";
}
