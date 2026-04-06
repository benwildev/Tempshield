import React, { useState } from "react";
import { Navbar, Footer, PageTransition } from "@/components/Layout";
import { Copy, Check, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-secondary">
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{lang}</span>
        </div>
        <button onClick={handleCopy} className="text-muted-foreground transition-colors hover:text-foreground">
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-green-400 dark:text-green-300 whitespace-pre-wrap">
        <code>{code}</code>
      </pre>
    </div>
  );
}

const INTEGRATIONS = [
  {
    id: "html",
    label: "HTML / WordPress",
    icon: "🌐",
    steps: [
      { title: "Get your API key", desc: "Sign up for a free account and copy your API key from the dashboard." },
      { title: "Add the script tag", desc: "Paste the snippet just before the closing </body> tag in your theme or page." },
      { title: "Done!", desc: "TempShield automatically attaches to all email input fields and validates in real-time." },
    ],
    code: `<!-- Paste just before the closing </body> tag -->
<!-- Works on WordPress, Webflow, Squarespace, Shopify, etc. -->
<script
  src="https://yourdomain.com/temp-email-validator.js"
  data-api-key="YOUR_API_KEY">
</script>

<!-- Full configuration example with all options -->
<script
  src="https://yourdomain.com/temp-email-validator.js"
  data-api-key="YOUR_API_KEY"

  data-debounce="600"

  data-error-message="Disposable email addresses are not allowed."
  data-error-color="#ef4444"
  data-error-border="#f87171"

  data-warn-mx-message="This email domain has no mail server — you may not receive messages."
  data-warn-mx-color="#f59e0b"
  data-warn-mx-border="#fbbf24"

  data-warn-free-message="Free email providers are not accepted. Please use a work email."
  data-warn-free-color="#f59e0b"
  data-warn-free-border="#fbbf24">
</script>`,
  },
  {
    id: "react",
    label: "React / Next.js",
    icon: "⚛️",
    steps: [
      { title: "Install nothing", desc: "No npm package needed — just call the REST API directly." },
      { title: "Add the hook", desc: "Copy the useEmailCheck hook into your project." },
      { title: "Use it in your form", desc: "Attach to any email input field and show the error message." },
    ],
    code: `import { useState, useEffect } from "react";

// Drop this hook anywhere in your project
function useEmailCheck(email: string) {
  const [result, setResult] = useState<{
    isDisposable: boolean | null;
    isLoading: boolean;
  }>({ isDisposable: null, isLoading: false });

  useEffect(() => {
    if (!email || !email.includes("@")) {
      setResult({ isDisposable: null, isLoading: false });
      return;
    }
    const timer = setTimeout(async () => {
      setResult(prev => ({ ...prev, isLoading: true }));
      try {
        const res = await fetch("/api/check-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer YOUR_API_KEY",
          },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        setResult({ isDisposable: data.isDisposable, isLoading: false });
      } catch {
        setResult({ isDisposable: null, isLoading: false });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [email]);

  return result;
}

// Usage in your form component:
function SignupForm() {
  const [email, setEmail] = useState("");
  const { isDisposable, isLoading } = useEmailCheck(email);

  return (
    <form>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ borderColor: isDisposable ? "red" : undefined }}
      />
      {isDisposable && (
        <p style={{ color: "red" }}>
          Temporary email addresses are not allowed.
        </p>
      )}
      <button disabled={isDisposable === true}>Sign Up</button>
    </form>
  );
}`,
  },
  {
    id: "laravel",
    label: "Laravel / PHP",
    icon: "🐘",
    steps: [
      { title: "Add to config", desc: "Store your API key in your .env file as TEMPSHIELD_KEY." },
      { title: "Create a validation rule", desc: "Register a custom validation rule or use the closure shown below." },
      { title: "Apply to any form", desc: "Use the rule in any FormRequest or controller." },
    ],
    code: `<?php

// .env
// TEMPSHIELD_KEY=your_api_key_here

// app/Rules/NoDisposableEmail.php
namespace App\\Rules;

use Illuminate\\Contracts\\Validation\\Rule;
use Illuminate\\Support\\Facades\\Http;

class NoDisposableEmail implements Rule
{
    public function passes($attribute, $value): bool
    {
        try {
            $response = Http::timeout(3)
                ->withHeaders([
                    'Authorization' => 'Bearer ' . config('services.tempshield.key'),
                ])
                ->post(config('services.tempshield.url') . '/api/check-email', [
                    'email' => $value,
                ]);

            return $response->successful()
                ? !$response->json('isDisposable')
                : true;
        } catch (\\Exception $e) {
            return true;
        }
    }

    public function message(): string
    {
        return 'Temporary email addresses are not allowed.';
    }
}

// Usage in FormRequest:
public function rules(): array
{
    return [
        'email' => ['required', 'email', new NoDisposableEmail],
    ];
}`,
  },
  {
    id: "python",
    label: "Python / Django",
    icon: "🐍",
    steps: [
      { title: "pip install requests", desc: "Or use httpx if you prefer async. No other dependencies needed." },
      { title: "Add the validator", desc: "Copy the is_disposable_email function into your project." },
      { title: "Apply to Django/FastAPI", desc: "Call it in your form validator, serializer, or Pydantic model." },
    ],
    code: `import requests
from functools import lru_cache

TEMPSHIELD_KEY = "YOUR_API_KEY"
TEMPSHIELD_URL = "https://yourdomain.com/api/check-email"

@lru_cache(maxsize=512)
def is_disposable_email(email: str) -> bool:
    try:
        response = requests.post(
            TEMPSHIELD_URL,
            json={"email": email},
            headers={
                "Authorization": f"Bearer {TEMPSHIELD_KEY}",
                "Content-Type": "application/json",
            },
            timeout=3,
        )
        data = response.json()
        return data.get("isDisposable", False)
    except Exception:
        return False

# Django Form example:
from django import forms

class SignupForm(forms.Form):
    email = forms.EmailField()

    def clean_email(self):
        email = self.cleaned_data["email"]
        if is_disposable_email(email):
            raise forms.ValidationError(
                "Temporary email addresses are not allowed."
            )
        return email`,
  },
  {
    id: "node",
    label: "Node.js / Express",
    icon: "🟩",
    steps: [
      { title: "Add middleware", desc: "Create a reusable middleware function." },
      { title: "Apply to routes", desc: "Add it to any route that accepts email addresses." },
      { title: "Handle the error", desc: "Return a 400 response with a clear error message." },
    ],
    code: `// middleware/checkEmail.js
const TEMPSHIELD_KEY = process.env.TEMPSHIELD_KEY;
const TEMPSHIELD_URL = process.env.TEMPSHIELD_URL || "https://yourdomain.com";

async function noDisposableEmail(req, res, next) {
  const email = req.body?.email;
  if (!email) return next();

  try {
    const response = await fetch(\`\${TEMPSHIELD_URL}/api/check-email\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${TEMPSHIELD_KEY}\`,
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (data.isDisposable) {
      return res.status(400).json({
        error: "Temporary email addresses are not allowed.",
        field: "email",
      });
    }
  } catch (err) {
    console.error("TempShield check failed:", err.message);
  }

  next();
}

// Usage in Express router:
router.post("/signup", noDisposableEmail, async (req, res) => {
  const { email, password } = req.body;
  // email is guaranteed non-disposable here
});`,
  },
  {
    id: "curl",
    label: "cURL / REST",
    icon: "⚡",
    steps: [
      { title: "No setup needed", desc: "Just make a POST request with your API key as a Bearer token." },
      { title: "Parse the response", desc: "Check the isDisposable field in the JSON response." },
      { title: "Handle the result", desc: "Reject the email if isDisposable is true." },
    ],
    code: `# Check if an email is disposable
curl -X POST https://yourdomain.com/api/check-email \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "test@mailinator.com"}'

# Response (disposable):
{
  "isDisposable": true,
  "domain": "mailinator.com",
  "requestsRemaining": 998
}

# Response (legitimate):
{
  "isDisposable": false,
  "domain": "gmail.com",
  "requestsRemaining": 997
}

# 401 — Invalid or missing API key
{ "error": "API key required. Pass Authorization: Bearer <your_api_key>" }

# 429 — Rate limit exceeded
{ "error": "Rate limit exceeded. Please upgrade your plan." }`,
  },
];

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState("html");
  const current = INTEGRATIONS.find(i => i.id === activeTab)!;

  return (
    <>
      <Navbar />
      <PageTransition>
        <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

            <div className="mb-14">
              <h1 className="font-heading text-4xl font-bold text-foreground mb-4">API Documentation</h1>
              <p className="text-muted-foreground max-w-2xl">
                Integrate TempShield into your stack in minutes. Choose your platform below to see the right integration guide.
              </p>
            </div>

            {/* AUTH */}
            <div className="glass-card rounded-2xl p-8 mb-6">
              <h2 className="font-heading text-lg font-semibold text-foreground mb-3">Authentication</h2>
              <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                Every request must include your API key in the{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-primary text-xs font-mono">Authorization</code>{" "}
                header as a Bearer token. Get your key from the{" "}
                <a href="/dashboard" className="text-primary underline underline-offset-2 hover:text-primary/80">dashboard</a>.
              </p>
              <CodeBlock lang="HTTP Header" code={`Authorization: Bearer YOUR_API_KEY`} />
            </div>

            {/* ENDPOINT REFERENCE */}
            <div className="glass-card rounded-2xl overflow-hidden mb-6">
              <div className="p-8 border-b border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <span className="rounded bg-primary/15 px-3 py-1 font-mono text-xs font-bold text-primary">POST</span>
                  <h2 className="font-heading text-lg font-semibold text-foreground font-mono">/api/check-email</h2>
                </div>
                <p className="text-sm text-muted-foreground">Checks if an email belongs to a known disposable/burner email provider.</p>
              </div>

              <div className="p-8 grid md:grid-cols-2 gap-8 bg-muted/10">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Request Body</p>
                  <CodeBlock lang="JSON" code={`{\n  "email": "test@mailinator.com"\n}`} />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-6">Response</p>
                  <CodeBlock lang="JSON" code={`{\n  "isDisposable": true,\n  "domain": "mailinator.com",\n  "requestsRemaining": 999\n}`} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Error Responses</p>
                  <div className="space-y-3">
                    {[
                      { status: "400", msg: '{ "error": "Invalid email address" }', color: "text-yellow-500" },
                      { status: "401", msg: '{ "error": "API key required." }', color: "text-red-500" },
                      { status: "429", msg: '{ "error": "Rate limit exceeded." }', color: "text-orange-500" },
                    ].map(e => (
                      <div key={e.status} className="rounded-lg border border-border bg-secondary p-3 font-mono text-xs">
                        <span className={`mr-2 font-bold ${e.color}`}>{e.status}</span>
                        <span className="text-muted-foreground">{e.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* INTEGRATION GUIDES */}
            <div className="mb-4">
              <h2 className="font-heading text-xl font-semibold text-foreground mb-2">Integration Guides</h2>
              <p className="text-sm text-muted-foreground">Pick your stack for a copy-paste integration example.</p>
            </div>

            <div className="glass-card rounded-2xl overflow-hidden">
              {/* Tabs */}
              <div className="flex overflow-x-auto border-b border-border/50 bg-muted/20">
                {INTEGRATIONS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === item.id
                        ? "text-foreground border-b-2 border-primary bg-primary/5"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="p-8 grid md:grid-cols-[1fr_2fr] gap-8 items-start"
                >
                  <div>
                    <h3 className="font-heading text-base font-semibold text-foreground mb-4">{current.label}</h3>
                    <ol className="space-y-5">
                      {current.steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{step.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <CodeBlock lang={current.label} code={current.code} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* EMBED SCRIPT ATTRIBUTES */}
            <div className="glass-card rounded-2xl overflow-hidden mt-6">
              <div className="p-8 border-b border-border/50">
                <h2 className="font-heading text-lg font-semibold text-foreground mb-2">Embed Script Attributes</h2>
                <p className="text-sm text-muted-foreground">
                  All behaviour of the <code className="rounded bg-muted px-1.5 py-0.5 text-primary text-xs font-mono">temp-email-validator.js</code> embed script is controlled by <code className="rounded bg-muted px-1.5 py-0.5 text-primary text-xs font-mono">data-*</code> attributes on the script tag.
                  The script has three display states — <span className="text-red-500 font-medium">Error</span> (blocks submit), <span className="text-amber-500 font-medium">Warning</span> (alerts but allows submit), and <span className="text-green-500 font-medium">Clear</span>.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/20">
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attribute</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {[
                      { attr: "data-api-key", def: '""', desc: "Your API key (required). Sent as Bearer token." },
                      { attr: "data-api-url", def: "script origin", desc: "Base URL of the API server. Defaults to the script's own origin." },
                      { attr: "data-debounce", def: "600", desc: "Milliseconds to wait after typing stops before firing the check." },
                      { attr: "data-error-message", def: "Temporary email addresses…", desc: "❌ Error shown for disposable emails. Blocks form submission." },
                      { attr: "data-error-color", def: "#ef4444", desc: "Text colour for the disposable-email error message." },
                      { attr: "data-error-border", def: "#f87171", desc: "Input border colour when a disposable email is detected." },
                      { attr: "data-warn-mx-message", def: "This email domain has no mail server…", desc: "⚠️ Warning shown when the domain has no MX records. Does NOT block submit." },
                      { attr: "data-warn-mx-color", def: "#f59e0b", desc: "Text colour for the MX warning message." },
                      { attr: "data-warn-mx-border", def: "#fbbf24", desc: "Input border colour for the MX warning." },
                      { attr: "data-warn-free-message", def: "Free email providers are not accepted…", desc: "⚠️ Warning shown for free providers (Gmail, Yahoo, etc.). Does NOT block submit." },
                      { attr: "data-warn-free-color", def: "#f59e0b", desc: "Text colour for the free email warning message." },
                      { attr: "data-warn-free-border", def: "#fbbf24", desc: "Input border colour for the free email warning." },
                    ].map(row => (
                      <tr key={row.attr} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-3 font-mono text-xs text-primary whitespace-nowrap">{row.attr}</td>
                        <td className="px-6 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{row.def}</td>
                        <td className="px-6 py-3 text-xs text-muted-foreground">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-8 border-t border-border/50 bg-muted/5 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Priority when multiple conditions are true</p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-3 py-1 text-red-500 font-medium">1. Disposable → Error (blocks form)</span>
                    <span className="text-muted-foreground self-center">→</span>
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-amber-500 font-medium">2. Free email → Warning</span>
                    <span className="text-muted-foreground self-center">→</span>
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-amber-500 font-medium">3. No MX → Warning</span>
                    <span className="text-muted-foreground self-center">→</span>
                    <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1 text-green-500 font-medium">4. Clean → Clear</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  MX detection and free email flagging are only active if your plan has those features enabled. The script reads <code className="rounded bg-muted px-1 py-0.5 text-primary font-mono">mxValid</code> and <code className="rounded bg-muted px-1 py-0.5 text-primary font-mono">isFreeEmail</code> from the API response automatically — no extra configuration needed.
                </p>
              </div>
            </div>

            {/* RATE LIMITS */}
            <div className="glass-card rounded-2xl p-8 mt-6">
              <h2 className="font-heading text-lg font-semibold text-foreground mb-6">Rate Limits</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { plan: "FREE", limit: "10 requests", period: "total (lifetime)", highlight: false },
                  { plan: "BASIC", limit: "1,000 requests", period: "per month", highlight: false },
                  { plan: "PRO", limit: "10,000 requests", period: "per month", highlight: true },
                ].map(p => (
                  <div key={p.plan} className={`rounded-xl p-5 border ${p.highlight ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{p.plan}</p>
                    <p className="font-heading text-xl font-bold text-foreground">{p.limit}</p>
                    <p className="text-xs text-muted-foreground mt-1">{p.period}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Exceeded your limit?{" "}
                <a href="/pricing" className="text-primary underline underline-offset-2 hover:text-primary/80">Upgrade your plan</a>
                {" "}or{" "}
                <a href="/upgrade" className="text-primary underline underline-offset-2 hover:text-primary/80">request an increase</a>.
              </p>
            </div>

          </motion.div>
        </main>
      </PageTransition>
      <Footer />
    </>
  );
}
