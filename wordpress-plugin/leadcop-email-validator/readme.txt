=== LeadCop Email Validator ===
Contributors: leadcop
Tags: email validation, disposable email, spam, woocommerce, contact form 7, ninja forms, elementor, fluent forms
Requires at least: 5.6
Tested up to: 6.5
Stable tag: 1.1.0
Requires PHP: 7.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Block disposable and unwanted email addresses from your WordPress forms using the LeadCop API.

== Description ==

**LeadCop Email Validator** protects your WordPress site by rejecting disposable (burner) email addresses, free email providers, and addresses with invalid MX records — in real time, server-side, so it cannot be bypassed.

= Key Features =

* **Disposable email detection** — blocks burner addresses from thousands of known providers
* **Free email provider control** — optionally warn or block Gmail, Yahoo, Outlook, and similar
* **MX record validation** — catch addresses that can never actually receive email
* **Allow / Block lists** — manually allowlist or blocklist any email address or entire domain, overriding the API
* **24-hour result cache** — API results are cached in WordPress transients, minimising your API usage
* **Activity log** — see every email check with outcome, reason, and form — last 1 000 entries kept
* **Admin dashboard widget** — today's blocked / warned / allowed counts at a glance
* **Admin notifications** — optional email to the site admin when a submission is blocked
* **WP REST API endpoint** — `GET /wp-json/leadcop/v1/check?email=…` for headless or custom use cases
* **Fully server-side** — no browser JavaScript required; cannot be bypassed by bots
* **Fail open** — if the LeadCop API is unreachable, forms continue to work normally
* **Live email tester** — try any address from the settings page before going live

= Supported Form Systems =

* WordPress registration and comment forms
* WooCommerce checkout and My Account registration
* Contact Form 7
* WPForms
* Gravity Forms
* Elementor Pro Forms
* Ninja Forms
* Fluent Forms

= Requirements =

You need a **LeadCop account** and an **API key**. Sign up free at [leadcop.io](https://leadcop.io).

== Installation ==

1. Upload the `leadcop-email-validator` folder to `/wp-content/plugins/`
2. Activate the plugin from the **Plugins** screen in WordPress
3. Go to **LeadCop** in the admin menu
4. Enter your **API Key** (get one at [leadcop.io/dashboard](https://leadcop.io/dashboard)) and click **Save Settings**

== Frequently Asked Questions ==

= Does this slow down my forms? =

Results are cached for 24 hours per email address, so repeat submissions are instant. The first check adds around 200–500 ms — unnoticeable to users.

= What happens if the LeadCop API is down? =

The plugin is designed to **fail open** — if the API cannot be reached for any reason, form submissions proceed normally. Your site will never be broken by a third-party outage.

= Can I customise the error messages? =

Yes. Go to **LeadCop → Validation Rules** and edit the message for each rule.

= Can I always allow my company email domain? =

Yes. Go to **LeadCop → Allow / Block Lists** and enter your domain (e.g. `mycompany.com`). It will bypass all API checks.

= Does this work with my page builder? =

Yes. Elementor Pro forms are supported natively. Any other page builder that uses CF7, WPForms, Gravity Forms, Ninja Forms, or Fluent Forms is covered automatically.

= Is there a REST API I can call from my theme or another plugin? =

Yes. Send a `GET` request to `/wp-json/leadcop/v1/check?email=someone@example.com` with your API key as a `Bearer` token in the `Authorization` header, or while logged in as an administrator.

== Changelog ==

= 1.1.0 =
* Added: Elementor Pro Forms, Ninja Forms, and Fluent Forms integrations
* Added: 24-hour transient cache for API results (reduces API usage)
* Added: Activity log with up to 1 000 entries (new admin tab)
* Added: WP Dashboard widget showing today's blocked / warned / allowed counts
* Added: Allow / Block lists — override the API for specific emails or entire domains
* Added: Admin email notifications when a submission is blocked
* Added: WP REST API endpoint (`GET /wp-json/leadcop/v1/check?email=…`)
* Added: Uninstall routine to clean up options and drop the log table

= 1.0.0 =
* Initial release

== Upgrade Notice ==

= 1.1.0 =
Major feature release. After upgrading, visit LeadCop → General to review new settings.

= 1.0.0 =
Initial release.
