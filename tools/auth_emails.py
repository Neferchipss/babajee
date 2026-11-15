"""The login emails (Supabase Auth), in the site's look, showing the 6-digit
code the onboarding screen asks for (0058). Prints the JSON body for
PATCH /v1/projects/{ref}/config/auth.

    python tools/auth_emails.py > body.json

Light by default, dark when the reader's mail app is dark (like the order
emails); Gmail ignores the dark part and shows light. {{ .Token }} is the code.
"""
import json

LOGO = "https://lyucnbevkcfmyusekium.supabase.co/storage/v1/object/public/email/logo.png"
SITE = "https://neferchipss.github.io/babajee"


def mail(kicker: str, title: str, lede: str) -> str:
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>
@media (prefers-color-scheme: dark) {{
  .bg {{ background:#000000 !important; }}
  .card {{ background:#121213 !important; border-color:#272729 !important; }}
  .ink {{ color:#f2f3f5 !important; }}
  .muted {{ color:#96979d !important; }}
  .code {{ background:#1b1b1c !important; color:#f2f3f5 !important; }}
  .gold {{ color:#d3ab70 !important; }}
}}
</style></head>
<body style="margin:0;padding:0" class="bg">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" bgcolor="#f0f2f5" style="background:#f0f2f5">
<tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:0 0 20px"><a href="{SITE}/"><img src="{LOGO}" width="150" alt="Babajee · The Smoke Shop" style="display:block;width:150px;height:auto;border:0"></a></td></tr>
<tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e7eaee;border-radius:18px;padding:28px 24px">
<div class="gold" style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9c7a3c;margin:0 0 8px">{kicker}</div>
<div class="ink" style="font-size:24px;line-height:1.25;font-weight:700;color:#0c0f14;margin:0 0 10px">{title}</div>
<p class="muted" style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#686f78">{lede}</p>
<div class="code" style="background:#f5f6f8;border-radius:14px;padding:18px 10px;text-align:center;font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#0c0f14">{{{{ .Token }}}}</div>
<p class="muted" style="margin:18px 0 0;font-size:13px;line-height:1.55;color:#686f78">The code works for one hour and only once. If you didn't ask for it, you can ignore this email: nothing happens without the code.</p>
</td></tr>
<tr><td align="center" class="muted" style="padding:18px 10px 0;font-size:12px;line-height:1.6;color:#686f78">This is an automated email from Babajee · The Smoke Shop.<br>For adults 18 and over.</td></tr>
</table>
</td></tr></table>
</body></html>"""


body = {
    "site_url": f"{SITE}/",
    "uri_allow_list": f"{SITE}/**,http://localhost:3300/**,http://localhost:3001/**",
    "mailer_otp_length": 6,
    "mailer_subjects_confirmation": "Your Babajee code: {{ .Token }}",
    "mailer_templates_confirmation_content": mail("Welcome to Babajee", "Here's your code", "Enter it on the sign-up screen to verify your email and create your account."),
    "mailer_subjects_magic_link": "Your Babajee code: {{ .Token }}",
    "mailer_templates_magic_link_content": mail("Log in", "Here's your code", "Enter it on the login screen to sign in to Babajee."),
}
print(json.dumps(body))
