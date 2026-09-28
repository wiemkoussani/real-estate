type MailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function brevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);
}

export async function sendMail({ to, subject, html, text }: MailInput) {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.BREVO_FROM_EMAIL;
  const name = process.env.BREVO_FROM_NAME || "AXIS";
  if (!key || !from) {
    return { ok: false as const, error: "Brevo is not configured" };
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": key,
    },
    body: JSON.stringify({
      sender: { email: from, name },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false as const, error: body.slice(0, 300) };
  }
  return { ok: true as const };
}

export function inviteEmail(_name: string, link: string) {
  const text = `Hello,\n\nYou were invited to the AXIS client workspace.\n${link}`;
  const html = `<p>Hello,</p><p>You were invited to the <strong>AXIS client workspace</strong>.</p><p><a href="${link}">Choose your password</a></p>`;
  return { subject: "Your AXIS client invitation", html, text };
}

export function resetEmail(link: string) {
  const text = `Reset your AXIS password using this link:\n${link}\n\nIf you did not ask for this, ignore the email.`;
  const html = `<p>Reset your AXIS password:</p><p><a href="${link}">Set a new password</a></p><p>If you did not ask for this, ignore the message.</p>`;
  return { subject: "Reset your AXIS password", html, text };
}
