<?php
defined( 'ABSPATH' ) || exit;

/**
 * Handles the WordPress admin settings page and dashboard widget for LeadCop.
 */
class LeadCop_Admin {

    public static function init() {
        add_action( 'admin_menu',            array( __CLASS__, 'add_menu' ) );
        add_action( 'admin_init',            array( __CLASS__, 'register_settings' ) );
        add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
        add_action( 'wp_ajax_leadcop_test_email',   array( __CLASS__, 'ajax_test_email' ) );
        add_action( 'wp_ajax_leadcop_clear_log',    array( __CLASS__, 'ajax_clear_log' ) );
        add_action( 'wp_dashboard_setup',    array( __CLASS__, 'register_dashboard_widget' ) );
    }

    public static function add_menu() {
        add_menu_page(
            __( 'LeadCop Email Validator', 'leadcop' ),
            __( 'LeadCop', 'leadcop' ),
            'manage_options',
            'leadcop',
            array( __CLASS__, 'render_page' ),
            'dashicons-shield-alt',
            75
        );
    }

    public static function register_settings() {
        $fields = array(
            'api_key', 'api_url',
            'block_disposable', 'free_email_action', 'mx_action',
            'msg_disposable', 'msg_free_email', 'msg_mx', 'msg_blocklist',
            'hook_wp_register', 'hook_wp_comment',
            'hook_woo_checkout', 'hook_woo_account',
            'hook_cf7', 'hook_wpforms', 'hook_gravityforms',
            'hook_elementor', 'hook_ninjaforms', 'hook_fluentforms',
            'allowlist', 'blocklist',
            'enable_log', 'notify_admin', 'notify_email',
        );
        foreach ( $fields as $field ) {
            register_setting(
                'leadcop_settings',
                'leadcop_' . $field,
                array( 'sanitize_callback' => 'sanitize_text_field' )
            );
        }
        // Textarea fields need a different sanitizer.
        foreach ( array( 'allowlist', 'blocklist' ) as $field ) {
            register_setting(
                'leadcop_settings',
                'leadcop_' . $field,
                array( 'sanitize_callback' => 'sanitize_textarea_field' )
            );
        }
    }

    public static function enqueue_assets( $hook ) {
        if ( $hook !== 'toplevel_page_leadcop' ) {
            return;
        }
        wp_enqueue_style( 'leadcop-admin', LEADCOP_PLUGIN_URL . 'assets/admin.css', array(), LEADCOP_VERSION );
        wp_enqueue_script( 'leadcop-admin', LEADCOP_PLUGIN_URL . 'assets/admin.js', array( 'jquery' ), LEADCOP_VERSION, true );
        wp_localize_script( 'leadcop-admin', 'leadcopAdmin', array(
            'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
            'nonce'         => wp_create_nonce( 'leadcop_test_email' ),
            'clearLogNonce' => wp_create_nonce( 'leadcop_clear_log' ),
        ) );
    }

    // ── AJAX: test email ──────────────────────────────────────────────────────

    public static function ajax_test_email() {
        check_ajax_referer( 'leadcop_test_email', 'nonce' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'leadcop' ) ) );
        }
        $email = isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
        if ( ! is_email( $email ) ) {
            wp_send_json_error( array( 'message' => __( 'Please enter a valid email address.', 'leadcop' ) ) );
        }

        // Check local lists first.
        $list_decision = LeadCop_API::check_lists( $email );
        if ( $list_decision !== null ) {
            wp_send_json_success( array(
                'source'   => 'local_list',
                'decision' => $list_decision,
            ) );
        }

        $result   = LeadCop_API::check_email( $email );
        $decision = LeadCop_API::evaluate( $result );

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( array( 'message' => $result->get_error_message() ) );
        }

        wp_send_json_success( array(
            'source'          => 'api',
            'isDisposable'    => ! empty( $result['isDisposable'] ),
            'isFreeEmail'     => ! empty( $result['isFreeEmail'] ),
            'mxValid'         => isset( $result['mxValid'] ) ? $result['mxValid'] : null,
            'reputationScore' => isset( $result['reputationScore'] ) ? $result['reputationScore'] : null,
            'riskLevel'       => isset( $result['riskLevel'] ) ? $result['riskLevel'] : null,
            'tags'            => isset( $result['tags'] ) ? $result['tags'] : array(),
            'decision'        => $decision,
        ) );
    }

    // ── AJAX: clear log ───────────────────────────────────────────────────────

    public static function ajax_clear_log() {
        check_ajax_referer( 'leadcop_clear_log', 'nonce' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( array( 'message' => __( 'Unauthorized.', 'leadcop' ) ) );
        }
        LeadCop_Log::truncate();
        wp_send_json_success( array( 'message' => __( 'Log cleared.', 'leadcop' ) ) );
    }

    // ── Dashboard widget ──────────────────────────────────────────────────────

    public static function register_dashboard_widget() {
        wp_add_dashboard_widget(
            'leadcop_dashboard_widget',
            __( 'LeadCop — Today\'s Email Stats', 'leadcop' ),
            array( __CLASS__, 'render_dashboard_widget' )
        );
    }

    public static function render_dashboard_widget() {
        $counts  = LeadCop_Log::get_today_counts();
        $blocked = isset( $counts['blocked'] ) ? $counts['blocked'] : 0;
        $warned  = isset( $counts['warned'] )  ? $counts['warned']  : 0;
        $allowed = isset( $counts['allowed'] ) ? $counts['allowed'] : 0;
        $total   = $blocked + $warned + $allowed;
        ?>
        <div style="display:flex;gap:16px;text-align:center;padding:8px 0;">
            <div style="flex:1;background:#fef2f2;border-radius:8px;padding:14px 8px;">
                <div style="font-size:28px;font-weight:700;color:#dc2626;"><?php echo esc_html( $blocked ); ?></div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;"><?php esc_html_e( 'Blocked', 'leadcop' ); ?></div>
            </div>
            <div style="flex:1;background:#fffbeb;border-radius:8px;padding:14px 8px;">
                <div style="font-size:28px;font-weight:700;color:#d97706;"><?php echo esc_html( $warned ); ?></div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;"><?php esc_html_e( 'Warned', 'leadcop' ); ?></div>
            </div>
            <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:14px 8px;">
                <div style="font-size:28px;font-weight:700;color:#16a34a;"><?php echo esc_html( $allowed ); ?></div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px;"><?php esc_html_e( 'Allowed', 'leadcop' ); ?></div>
            </div>
        </div>
        <p style="text-align:center;color:#9ca3af;font-size:12px;margin:8px 0 4px;">
            <?php printf( esc_html__( '%d checks today', 'leadcop' ), $total ); ?>
            &nbsp;&middot;&nbsp;
            <a href="<?php echo esc_url( admin_url( 'admin.php?page=leadcop&tab=log' ) ); ?>"><?php esc_html_e( 'View full log', 'leadcop' ); ?></a>
        </p>
        <?php
    }

    // ── Settings page ─────────────────────────────────────────────────────────

    public static function render_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }
        $active_tab = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'general';
        ?>
        <div class="wrap leadcop-wrap">
            <div class="leadcop-header">
                <div class="leadcop-logo">
                    <span class="dashicons dashicons-shield-alt"></span>
                    <h1>LeadCop Email Validator</h1>
                </div>
                <p class="leadcop-tagline"><?php esc_html_e( 'Block disposable and unwanted email addresses from your WordPress forms.', 'leadcop' ); ?></p>
            </div>

            <nav class="leadcop-tabs nav-tab-wrapper">
                <?php
                $tabs = array(
                    'general'      => __( 'General', 'leadcop' ),
                    'rules'        => __( 'Validation Rules', 'leadcop' ),
                    'integrations' => __( 'Form Integrations', 'leadcop' ),
                    'lists'        => __( 'Allow / Block Lists', 'leadcop' ),
                    'log'          => __( 'Activity Log', 'leadcop' ),
                );
                foreach ( $tabs as $slug => $label ) {
                    $class = ( $active_tab === $slug ) ? 'nav-tab nav-tab-active' : 'nav-tab';
                    $url   = add_query_arg( array( 'page' => 'leadcop', 'tab' => $slug ), admin_url( 'admin.php' ) );
                    printf( '<a href="%s" class="%s">%s</a>', esc_url( $url ), esc_attr( $class ), esc_html( $label ) );
                }
                ?>
            </nav>

            <?php if ( $active_tab !== 'log' ) : ?>
            <form method="post" action="options.php">
                <?php settings_fields( 'leadcop_settings' ); ?>
            <?php endif; ?>

                <?php if ( $active_tab === 'general' ) : ?>
                    <div class="leadcop-section">
                        <h2><?php esc_html_e( 'API Configuration', 'leadcop' ); ?></h2>
                        <table class="form-table" role="presentation">
                            <tr>
                                <th scope="row"><label for="leadcop_api_key"><?php esc_html_e( 'API Key', 'leadcop' ); ?></label></th>
                                <td>
                                    <input type="password" id="leadcop_api_key" name="leadcop_api_key"
                                           value="<?php echo esc_attr( get_option( 'leadcop_api_key', '' ) ); ?>"
                                           class="regular-text" autocomplete="new-password" />
                                    <p class="description">
                                        <?php printf(
                                            esc_html__( 'Get your API key from the %s.', 'leadcop' ),
                                            '<a href="https://leadcop.io/dashboard" target="_blank">' . esc_html__( 'LeadCop dashboard', 'leadcop' ) . '</a>'
                                        ); ?>
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><label for="leadcop_api_url"><?php esc_html_e( 'API URL', 'leadcop' ); ?></label></th>
                                <td>
                                    <input type="url" id="leadcop_api_url" name="leadcop_api_url"
                                           value="<?php echo esc_attr( get_option( 'leadcop_api_url', 'https://leadcop.io' ) ); ?>"
                                           class="regular-text" />
                                    <p class="description"><?php esc_html_e( 'Leave as default unless you are self-hosting LeadCop.', 'leadcop' ); ?></p>
                                </td>
                            </tr>
                        </table>

                        <h2 class="leadcop-mt"><?php esc_html_e( 'Activity Log', 'leadcop' ); ?></h2>
                        <table class="form-table" role="presentation">
                            <tr>
                                <th scope="row"><?php esc_html_e( 'Enable Logging', 'leadcop' ); ?></th>
                                <td>
                                    <label class="leadcop-toggle">
                                        <input type="hidden" name="leadcop_enable_log" value="0" />
                                        <input type="checkbox" name="leadcop_enable_log" value="1" <?php checked( get_option( 'leadcop_enable_log', '1' ), '1' ); ?> />
                                        <?php esc_html_e( 'Record every email check to the activity log', 'leadcop' ); ?>
                                    </label>
                                    <p class="description"><?php esc_html_e( 'The log keeps the last 1 000 entries. View it under the Activity Log tab.', 'leadcop' ); ?></p>
                                </td>
                            </tr>
                        </table>

                        <h2 class="leadcop-mt"><?php esc_html_e( 'Admin Notifications', 'leadcop' ); ?></h2>
                        <table class="form-table" role="presentation">
                            <tr>
                                <th scope="row"><?php esc_html_e( 'Notify on Block', 'leadcop' ); ?></th>
                                <td>
                                    <label class="leadcop-toggle">
                                        <input type="hidden" name="leadcop_notify_admin" value="0" />
                                        <input type="checkbox" name="leadcop_notify_admin" value="1" <?php checked( get_option( 'leadcop_notify_admin', '0' ), '1' ); ?> />
                                        <?php esc_html_e( 'Send an email to the admin when a submission is blocked', 'leadcop' ); ?>
                                    </label>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><label for="leadcop_notify_email"><?php esc_html_e( 'Notification Email', 'leadcop' ); ?></label></th>
                                <td>
                                    <input type="email" id="leadcop_notify_email" name="leadcop_notify_email"
                                           value="<?php echo esc_attr( get_option( 'leadcop_notify_email', get_option( 'admin_email' ) ) ); ?>"
                                           class="regular-text" />
                                    <p class="description"><?php esc_html_e( 'Defaults to the site admin email if left blank.', 'leadcop' ); ?></p>
                                </td>
                            </tr>
                        </table>

                        <h2 class="leadcop-mt"><?php esc_html_e( 'Test Email Verification', 'leadcop' ); ?></h2>
                        <div class="leadcop-test-tool">
                            <div class="leadcop-test-row">
                                <input type="email" id="leadcop-test-email" placeholder="<?php esc_attr_e( 'test@example.com', 'leadcop' ); ?>" class="regular-text" />
                                <button type="button" id="leadcop-test-btn" class="button button-primary"><?php esc_html_e( 'Check Email', 'leadcop' ); ?></button>
                            </div>
                            <div id="leadcop-test-result" class="leadcop-test-result" style="display:none;"></div>
                        </div>

                        <?php submit_button( __( 'Save Settings', 'leadcop' ) ); ?>
                    </div>

                <?php elseif ( $active_tab === 'rules' ) : ?>
                    <div class="leadcop-section">
                        <h2><?php esc_html_e( 'Validation Rules', 'leadcop' ); ?></h2>
                        <p class="description leadcop-desc"><?php esc_html_e( 'Configure how the plugin responds to each type of email address.', 'leadcop' ); ?></p>

                        <table class="form-table" role="presentation">

                            <tr>
                                <th scope="row"><?php esc_html_e( 'Disposable Emails', 'leadcop' ); ?></th>
                                <td>
                                    <label class="leadcop-toggle">
                                        <input type="hidden" name="leadcop_block_disposable" value="0" />
                                        <input type="checkbox" name="leadcop_block_disposable" value="1" <?php checked( get_option( 'leadcop_block_disposable', '1' ), '1' ); ?> />
                                        <?php esc_html_e( 'Block disposable / burner email addresses', 'leadcop' ); ?>
                                    </label>
                                    <p class="description"><?php esc_html_e( 'Recommended. This is the primary function of the plugin.', 'leadcop' ); ?></p>
                                    <div class="leadcop-msg-field">
                                        <label for="leadcop_msg_disposable"><?php esc_html_e( 'Error message shown to the visitor:', 'leadcop' ); ?></label>
                                        <input type="text" id="leadcop_msg_disposable" name="leadcop_msg_disposable"
                                               value="<?php echo esc_attr( get_option( 'leadcop_msg_disposable', __( 'Disposable email addresses are not allowed.', 'leadcop' ) ) ); ?>"
                                               class="large-text" />
                                    </div>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row"><?php esc_html_e( 'Free Email Providers', 'leadcop' ); ?></th>
                                <td>
                                    <select name="leadcop_free_email_action">
                                        <?php
                                        $current_free = get_option( 'leadcop_free_email_action', 'off' );
                                        $options = array(
                                            'off'   => __( 'Off — allow all free providers', 'leadcop' ),
                                            'warn'  => __( 'Warn — show a warning but allow submission', 'leadcop' ),
                                            'block' => __( 'Block — reject free provider emails', 'leadcop' ),
                                        );
                                        foreach ( $options as $val => $label ) {
                                            printf( '<option value="%s" %s>%s</option>', esc_attr( $val ), selected( $current_free, $val, false ), esc_html( $label ) );
                                        }
                                        ?>
                                    </select>
                                    <p class="description"><?php esc_html_e( 'Gmail, Yahoo, Outlook, and other major free providers.', 'leadcop' ); ?></p>
                                    <div class="leadcop-msg-field">
                                        <label for="leadcop_msg_free_email"><?php esc_html_e( 'Message shown to the visitor:', 'leadcop' ); ?></label>
                                        <input type="text" id="leadcop_msg_free_email" name="leadcop_msg_free_email"
                                               value="<?php echo esc_attr( get_option( 'leadcop_msg_free_email', __( 'Free email providers are not accepted. Please use a work email.', 'leadcop' ) ) ); ?>"
                                               class="large-text" />
                                    </div>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row"><?php esc_html_e( 'No MX Records', 'leadcop' ); ?></th>
                                <td>
                                    <select name="leadcop_mx_action">
                                        <?php
                                        $current_mx = get_option( 'leadcop_mx_action', 'off' );
                                        $options = array(
                                            'off'   => __( 'Off — ignore MX status', 'leadcop' ),
                                            'warn'  => __( 'Warn — show a warning but allow submission', 'leadcop' ),
                                            'block' => __( 'Block — reject emails from domains with no MX records', 'leadcop' ),
                                        );
                                        foreach ( $options as $val => $label ) {
                                            printf( '<option value="%s" %s>%s</option>', esc_attr( $val ), selected( $current_mx, $val, false ), esc_html( $label ) );
                                        }
                                        ?>
                                    </select>
                                    <p class="description"><?php esc_html_e( 'Domains with no MX records cannot receive email. Requires MX detection on your LeadCop plan.', 'leadcop' ); ?></p>
                                    <div class="leadcop-msg-field">
                                        <label for="leadcop_msg_mx"><?php esc_html_e( 'Message shown to the visitor:', 'leadcop' ); ?></label>
                                        <input type="text" id="leadcop_msg_mx" name="leadcop_msg_mx"
                                               value="<?php echo esc_attr( get_option( 'leadcop_msg_mx', __( 'This email domain has no mail server — messages may not be delivered.', 'leadcop' ) ) ); ?>"
                                               class="large-text" />
                                    </div>
                                </td>
                            </tr>

                        </table>
                        <?php submit_button( __( 'Save Rules', 'leadcop' ) ); ?>
                    </div>

                <?php elseif ( $active_tab === 'integrations' ) : ?>
                    <div class="leadcop-section">
                        <h2><?php esc_html_e( 'Form Integrations', 'leadcop' ); ?></h2>
                        <p class="description leadcop-desc"><?php esc_html_e( 'Choose which form systems LeadCop should validate. Third-party plugins only appear when they are installed and active.', 'leadcop' ); ?></p>

                        <table class="form-table" role="presentation">

                            <tr>
                                <th scope="row"><?php esc_html_e( 'WordPress Core', 'leadcop' ); ?></th>
                                <td>
                                    <label class="leadcop-toggle">
                                        <input type="hidden" name="leadcop_hook_wp_register" value="0" />
                                        <input type="checkbox" name="leadcop_hook_wp_register" value="1" <?php checked( get_option( 'leadcop_hook_wp_register', '1' ), '1' ); ?> />
                                        <?php esc_html_e( 'User registration form', 'leadcop' ); ?>
                                    </label><br>
                                    <label class="leadcop-toggle">
                                        <input type="hidden" name="leadcop_hook_wp_comment" value="0" />
                                        <input type="checkbox" name="leadcop_hook_wp_comment" value="1" <?php checked( get_option( 'leadcop_hook_wp_comment', '1' ), '1' ); ?> />
                                        <?php esc_html_e( 'Comment submission form', 'leadcop' ); ?>
                                    </label>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">WooCommerce</th>
                                <td>
                                    <?php if ( ! class_exists( 'WooCommerce' ) ) : ?>
                                        <p class="leadcop-not-installed"><?php esc_html_e( 'WooCommerce is not installed or active.', 'leadcop' ); ?></p>
                                    <?php else : ?>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_woo_checkout" value="0" />
                                            <input type="checkbox" name="leadcop_hook_woo_checkout" value="1" <?php checked( get_option( 'leadcop_hook_woo_checkout', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'Checkout billing email', 'leadcop' ); ?>
                                        </label><br>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_woo_account" value="0" />
                                            <input type="checkbox" name="leadcop_hook_woo_account" value="1" <?php checked( get_option( 'leadcop_hook_woo_account', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'My Account registration form', 'leadcop' ); ?>
                                        </label>
                                    <?php endif; ?>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">Contact Form 7</th>
                                <td>
                                    <?php if ( ! class_exists( 'WPCF7' ) ) : ?>
                                        <p class="leadcop-not-installed"><?php esc_html_e( 'Contact Form 7 is not installed or active.', 'leadcop' ); ?></p>
                                    <?php else : ?>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_cf7" value="0" />
                                            <input type="checkbox" name="leadcop_hook_cf7" value="1" <?php checked( get_option( 'leadcop_hook_cf7', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'Validate email fields in all CF7 forms', 'leadcop' ); ?>
                                        </label>
                                    <?php endif; ?>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">WPForms</th>
                                <td>
                                    <?php if ( ! function_exists( 'wpforms' ) ) : ?>
                                        <p class="leadcop-not-installed"><?php esc_html_e( 'WPForms is not installed or active.', 'leadcop' ); ?></p>
                                    <?php else : ?>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_wpforms" value="0" />
                                            <input type="checkbox" name="leadcop_hook_wpforms" value="1" <?php checked( get_option( 'leadcop_hook_wpforms', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'Validate email fields in all WPForms forms', 'leadcop' ); ?>
                                        </label>
                                    <?php endif; ?>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">Gravity Forms</th>
                                <td>
                                    <?php if ( ! class_exists( 'GFCommon' ) ) : ?>
                                        <p class="leadcop-not-installed"><?php esc_html_e( 'Gravity Forms is not installed or active.', 'leadcop' ); ?></p>
                                    <?php else : ?>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_gravityforms" value="0" />
                                            <input type="checkbox" name="leadcop_hook_gravityforms" value="1" <?php checked( get_option( 'leadcop_hook_gravityforms', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'Validate email fields in all Gravity Forms', 'leadcop' ); ?>
                                        </label>
                                    <?php endif; ?>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">Elementor Forms</th>
                                <td>
                                    <?php if ( ! did_action( 'elementor_pro/init' ) ) : ?>
                                        <p class="leadcop-not-installed"><?php esc_html_e( 'Elementor Pro is not installed or active.', 'leadcop' ); ?></p>
                                    <?php else : ?>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_elementor" value="0" />
                                            <input type="checkbox" name="leadcop_hook_elementor" value="1" <?php checked( get_option( 'leadcop_hook_elementor', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'Validate email fields in all Elementor Pro forms', 'leadcop' ); ?>
                                        </label>
                                    <?php endif; ?>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">Ninja Forms</th>
                                <td>
                                    <?php if ( ! class_exists( 'Ninja_Forms' ) ) : ?>
                                        <p class="leadcop-not-installed"><?php esc_html_e( 'Ninja Forms is not installed or active.', 'leadcop' ); ?></p>
                                    <?php else : ?>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_ninjaforms" value="0" />
                                            <input type="checkbox" name="leadcop_hook_ninjaforms" value="1" <?php checked( get_option( 'leadcop_hook_ninjaforms', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'Validate email fields in all Ninja Forms', 'leadcop' ); ?>
                                        </label>
                                    <?php endif; ?>
                                </td>
                            </tr>

                            <tr>
                                <th scope="row">Fluent Forms</th>
                                <td>
                                    <?php if ( ! defined( 'FLUENTFORM' ) ) : ?>
                                        <p class="leadcop-not-installed"><?php esc_html_e( 'Fluent Forms is not installed or active.', 'leadcop' ); ?></p>
                                    <?php else : ?>
                                        <label class="leadcop-toggle">
                                            <input type="hidden" name="leadcop_hook_fluentforms" value="0" />
                                            <input type="checkbox" name="leadcop_hook_fluentforms" value="1" <?php checked( get_option( 'leadcop_hook_fluentforms', '1' ), '1' ); ?> />
                                            <?php esc_html_e( 'Validate email fields in all Fluent Forms', 'leadcop' ); ?>
                                        </label>
                                    <?php endif; ?>
                                </td>
                            </tr>

                        </table>
                        <?php submit_button( __( 'Save Integrations', 'leadcop' ) ); ?>
                    </div>

                <?php elseif ( $active_tab === 'lists' ) : ?>
                    <div class="leadcop-section">
                        <h2><?php esc_html_e( 'Allow / Block Lists', 'leadcop' ); ?></h2>
                        <p class="description leadcop-desc">
                            <?php esc_html_e( 'These lists override the LeadCop API. Enter one email address or domain per line. Domains can be entered as "example.com" or "@example.com".', 'leadcop' ); ?>
                        </p>

                        <table class="form-table" role="presentation">
                            <tr>
                                <th scope="row"><label for="leadcop_allowlist"><?php esc_html_e( 'Allowlist', 'leadcop' ); ?></label></th>
                                <td>
                                    <textarea id="leadcop_allowlist" name="leadcop_allowlist" rows="8" class="large-text code"><?php echo esc_textarea( get_option( 'leadcop_allowlist', '' ) ); ?></textarea>
                                    <p class="description"><?php esc_html_e( 'Emails and domains here are always allowed, bypassing all API checks.', 'leadcop' ); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><label for="leadcop_blocklist"><?php esc_html_e( 'Blocklist', 'leadcop' ); ?></label></th>
                                <td>
                                    <textarea id="leadcop_blocklist" name="leadcop_blocklist" rows="8" class="large-text code"><?php echo esc_textarea( get_option( 'leadcop_blocklist', '' ) ); ?></textarea>
                                    <p class="description"><?php esc_html_e( 'Emails and domains here are always blocked, regardless of the API result.', 'leadcop' ); ?></p>
                                    <div class="leadcop-msg-field">
                                        <label for="leadcop_msg_blocklist"><?php esc_html_e( 'Error message shown to the visitor:', 'leadcop' ); ?></label>
                                        <input type="text" id="leadcop_msg_blocklist" name="leadcop_msg_blocklist"
                                               value="<?php echo esc_attr( get_option( 'leadcop_msg_blocklist', __( 'This email address is not accepted.', 'leadcop' ) ) ); ?>"
                                               class="large-text" />
                                    </div>
                                </td>
                            </tr>
                        </table>
                        <?php submit_button( __( 'Save Lists', 'leadcop' ) ); ?>
                    </div>

                <?php elseif ( $active_tab === 'log' ) : ?>
                    <div class="leadcop-section">
                        <h2 style="display:flex;align-items:center;gap:12px;">
                            <?php esc_html_e( 'Activity Log', 'leadcop' ); ?>
                            <button type="button" id="leadcop-clear-log" class="button button-secondary" style="margin-left:auto;">
                                <?php esc_html_e( 'Clear Log', 'leadcop' ); ?>
                            </button>
                        </h2>
                        <p class="description leadcop-desc"><?php esc_html_e( 'The most recent 100 email checks. The log keeps up to 1 000 entries total.', 'leadcop' ); ?></p>

                        <?php
                        $entries = LeadCop_Log::get_recent( 100 );
                        if ( empty( $entries ) ) :
                        ?>
                            <p><?php esc_html_e( 'No entries yet. Email checks will appear here once the plugin starts validating addresses.', 'leadcop' ); ?></p>
                        <?php else : ?>
                            <table class="widefat striped leadcop-log-table">
                                <thead>
                                    <tr>
                                        <th><?php esc_html_e( 'Email', 'leadcop' ); ?></th>
                                        <th><?php esc_html_e( 'Outcome', 'leadcop' ); ?></th>
                                        <th><?php esc_html_e( 'Reason', 'leadcop' ); ?></th>
                                        <th><?php esc_html_e( 'Form', 'leadcop' ); ?></th>
                                        <th><?php esc_html_e( 'Time', 'leadcop' ); ?></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ( $entries as $entry ) :
                                        $badge_color = array(
                                            'blocked' => '#dc2626',
                                            'warned'  => '#d97706',
                                            'allowed' => '#16a34a',
                                        );
                                        $color = isset( $badge_color[ $entry->outcome ] ) ? $badge_color[ $entry->outcome ] : '#6b7280';
                                    ?>
                                    <tr>
                                        <td><code><?php echo esc_html( $entry->email ); ?></code></td>
                                        <td>
                                            <span style="color:<?php echo esc_attr( $color ); ?>;font-weight:600;text-transform:capitalize;">
                                                <?php echo esc_html( $entry->outcome ); ?>
                                            </span>
                                        </td>
                                        <td><?php echo esc_html( str_replace( '_', ' ', $entry->reason ) ); ?></td>
                                        <td><?php echo esc_html( str_replace( '_', ' ', $entry->form ) ); ?></td>
                                        <td><?php echo esc_html( get_date_from_gmt( $entry->checked_at, 'M j, H:i' ) ); ?></td>
                                    </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        <?php endif; ?>
                    </div>

                <?php endif; ?>

            <?php if ( $active_tab !== 'log' ) : ?>
            </form>
            <?php endif; ?>
        </div>
        <?php
    }
}
