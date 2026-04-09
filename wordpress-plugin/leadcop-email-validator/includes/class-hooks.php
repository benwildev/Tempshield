<?php
defined( 'ABSPATH' ) || exit;

class LeadCop_Hooks {

    private static $decision_cache = array();

    // Per-request warning state (validation → output, same AJAX request).
    private static $cf7_warn     = '';
    private static $wpforms_warn = array();
    private static $gf_warn      = array();

    // WP comment warn message; transferred to a short-lived cookie in comment_post.
    private static $comment_warn_msg = '';

    public static function init() {
        if ( get_option( 'leadcop_hook_wp_register', '1' ) === '1' ) {
            add_filter( 'registration_errors', array( __CLASS__, 'validate_wp_register' ), 10, 3 );
            add_filter( 'login_message', array( __CLASS__, 'render_login_warn' ) );
        }

        if ( get_option( 'leadcop_hook_wp_comment', '1' ) === '1' ) {
            add_filter( 'preprocess_comment', array( __CLASS__, 'validate_wp_comment' ) );
            add_action( 'wp_footer', array( __CLASS__, 'render_comment_warn_footer' ) );
        }

        if ( class_exists( 'WooCommerce' ) ) {
            if ( get_option( 'leadcop_hook_woo_checkout', '1' ) === '1' ) {
                add_action( 'woocommerce_checkout_process', array( __CLASS__, 'validate_woo_checkout' ) );
            }
            if ( get_option( 'leadcop_hook_woo_account', '1' ) === '1' ) {
                add_filter( 'woocommerce_registration_errors', array( __CLASS__, 'validate_woo_register' ), 10, 3 );
            }
        }

        if ( class_exists( 'WPCF7' ) && get_option( 'leadcop_hook_cf7', '1' ) === '1' ) {
            add_filter( 'wpcf7_validate_email',  array( __CLASS__, 'validate_cf7_email' ), 20, 2 );
            add_filter( 'wpcf7_validate_email*', array( __CLASS__, 'validate_cf7_email' ), 20, 2 );
            add_filter( 'wpcf7_form_response_output', array( __CLASS__, 'render_cf7_warn' ), 20, 4 );
        }

        if ( function_exists( 'wpforms' ) && get_option( 'leadcop_hook_wpforms', '1' ) === '1' ) {
            add_action( 'wpforms_process_validate_email', array( __CLASS__, 'validate_wpforms_email' ), 10, 3 );
            add_filter( 'wpforms_confirmation_message', array( __CLASS__, 'render_wpforms_warn' ), 10, 4 );
        }

        if ( class_exists( 'GFCommon' ) && get_option( 'leadcop_hook_gravityforms', '1' ) === '1' ) {
            add_filter( 'gform_field_validation', array( __CLASS__, 'validate_gravity_email' ), 10, 4 );
            add_filter( 'gform_confirmation', array( __CLASS__, 'render_gravity_warn' ), 10, 4 );
        }

        // ── Elementor Pro Forms ───────────────────────────────────────────────
        if ( get_option( 'leadcop_hook_elementor', '1' ) === '1' ) {
            add_action( 'elementor_pro/forms/validation', array( __CLASS__, 'validate_elementor_form' ), 10, 2 );
            add_action( 'wp_footer', array( __CLASS__, 'render_generic_warn_footer' ) );
        }

        // ── Ninja Forms ───────────────────────────────────────────────────────
        if ( class_exists( 'Ninja_Forms' ) && get_option( 'leadcop_hook_ninjaforms', '1' ) === '1' ) {
            add_filter( 'ninja_forms_submit_data', array( __CLASS__, 'validate_ninjaforms' ) );
            // warn footer registered once (shared with Elementor above if not already added)
            if ( get_option( 'leadcop_hook_elementor', '1' ) !== '1' ) {
                add_action( 'wp_footer', array( __CLASS__, 'render_generic_warn_footer' ) );
            }
        }

        // ── Fluent Forms ──────────────────────────────────────────────────────
        if ( defined( 'FLUENTFORM' ) && get_option( 'leadcop_hook_fluentforms', '1' ) === '1' ) {
            add_filter( 'fluentform/validate_input_item_input_email', array( __CLASS__, 'validate_fluentforms_email' ), 10, 5 );
            add_filter( 'fluentform/validate_input_item_email',       array( __CLASS__, 'validate_fluentforms_email' ), 10, 5 );
            if ( get_option( 'leadcop_hook_elementor', '1' ) !== '1' && ! class_exists( 'Ninja_Forms' ) ) {
                add_action( 'wp_footer', array( __CLASS__, 'render_generic_warn_footer' ) );
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Get (or build) the validation decision for an email address.
     * Results are cached per-request. Logging and admin notifications are
     * triggered here so no individual hook needs to handle them.
     *
     * @param string $email
     * @param string $form  Human-readable identifier for the log (e.g. 'woo_checkout').
     * @return array  { block: bool, warn: bool, message: string, reason: string }
     */
    private static function get_decision( $email, $form = '' ) {
        $email = sanitize_email( $email );

        if ( ! isset( self::$decision_cache[ $email ] ) ) {
            // 1. Check local allowlist / blocklist first.
            $decision = LeadCop_API::check_lists( $email );

            // 2. Fall through to the API if not on any list.
            if ( $decision === null ) {
                $result   = LeadCop_API::check_email( $email );
                $decision = LeadCop_API::evaluate( $result );
            }

            self::$decision_cache[ $email ] = $decision;

            // 3. Log (if logging is enabled).
            if ( get_option( 'leadcop_enable_log', '1' ) === '1' ) {
                $outcome = $decision['block'] ? 'blocked' : ( $decision['warn'] ? 'warned' : 'allowed' );
                LeadCop_Log::insert( $email, $outcome, $decision['reason'], $form );
            }

            // 4. Admin email notification on block.
            if ( $decision['block'] && get_option( 'leadcop_notify_admin', '0' ) === '1' ) {
                self::send_admin_notification( $email, $decision, $form );
            }
        }

        return self::$decision_cache[ $email ];
    }

    private static function warn_style() {
        return 'color:#92400e;background:#fffbeb;border:1px solid #fcd34d;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:0.9em;';
    }

    private static function send_admin_notification( $email, $decision, $form ) {
        $to      = get_option( 'leadcop_notify_email', get_option( 'admin_email' ) );
        $subject = sprintf( __( '[LeadCop] Blocked email on %s', 'leadcop' ), get_bloginfo( 'name' ) );
        $body    = sprintf(
            /* translators: 1: email, 2: form, 3: reason, 4: message */
            __( "LeadCop blocked an email address.\n\nEmail:  %1\$s\nForm:   %2\$s\nReason: %3\$s\nMessage shown: %4\$s\n\nSite: %5\$s", 'leadcop' ),
            $email,
            $form ?: __( 'unknown', 'leadcop' ),
            $decision['reason'],
            $decision['message'],
            home_url()
        );
        wp_mail( $to, $subject, $body );
    }

    // ── WordPress registration ────────────────────────────────────────────────

    public static function validate_wp_register( $errors, $sanitized_user_login, $user_email ) {
        if ( $errors->get_error_code() ) {
            return $errors;
        }
        $d = self::get_decision( $user_email, 'wp_register' );
        if ( $d['block'] ) {
            $errors->add( 'leadcop_email_error', esc_html( $d['message'] ) );
        } elseif ( $d['warn'] ) {
            // Surface warning on the wp-login.php confirmation page via a transient.
            $key = 'leadcop_rwarn_' . substr( md5( microtime() . wp_rand() ), 0, 8 );
            set_transient( $key, $d['message'], 120 );
            set_transient( 'leadcop_rwarn_key', $key, 120 );
        }
        return $errors;
    }

    public static function render_login_warn( $message ) {
        $key = get_transient( 'leadcop_rwarn_key' );
        if ( ! $key ) {
            return $message;
        }
        $warn = get_transient( $key );
        if ( $warn ) {
            delete_transient( $key );
            delete_transient( 'leadcop_rwarn_key' );
            $message .= '<p class="message" style="' . self::warn_style() . '">' . esc_html( $warn ) . '</p>';
        }
        return $message;
    }

    // ── WordPress comments ────────────────────────────────────────────────────

    public static function validate_wp_comment( $commentdata ) {
        if ( empty( $commentdata['comment_author_email'] ) ) {
            return $commentdata;
        }
        $d = self::get_decision( $commentdata['comment_author_email'], 'wp_comment' );
        if ( $d['block'] ) {
            wp_die( esc_html( $d['message'] ), esc_html__( 'Email Error', 'leadcop' ), array( 'back_link' => true ) );
        } elseif ( $d['warn'] ) {
            self::$comment_warn_msg = $d['message'];
            add_action( 'comment_post', array( __CLASS__, 'set_comment_warn_cookie' ), 5 );
        }
        return $commentdata;
    }

    public static function set_comment_warn_cookie( $comment_id ) {
        if ( ! self::$comment_warn_msg ) {
            return;
        }
        setcookie(
            'leadcop_cwarn',
            self::$comment_warn_msg,
            time() + 60,
            defined( 'COOKIEPATH' ) ? COOKIEPATH : '/',
            defined( 'COOKIE_DOMAIN' ) ? COOKIE_DOMAIN : '',
            is_ssl(),
            true
        );
    }

    public static function render_comment_warn_footer() {
        if ( empty( $_COOKIE['leadcop_cwarn'] ) ) {
            return;
        }
        $msg = sanitize_text_field( wp_unslash( $_COOKIE['leadcop_cwarn'] ) );
        setcookie( 'leadcop_cwarn', '', time() - 3600, defined( 'COOKIEPATH' ) ? COOKIEPATH : '/' );
        $style = esc_js( self::warn_style() );
        $json  = wp_json_encode( $msg );
        echo "<script>
(function(){
    var msg=" . $json . ";
    var el=document.createElement('p');
    el.style.cssText='" . $style . "';
    el.textContent=msg;
    var target=document.querySelector('#respond,#comments,#comment');
    if(target){target.parentNode.insertBefore(el,target);}else{document.body.prepend(el);}
})();
</script>\n";
    }

    // ── WooCommerce checkout ──────────────────────────────────────────────────

    public static function validate_woo_checkout() {
        $email = isset( $_POST['billing_email'] ) ? sanitize_email( wp_unslash( $_POST['billing_email'] ) ) : '';
        if ( ! $email ) {
            return;
        }
        $d = self::get_decision( $email, 'woo_checkout' );
        if ( $d['block'] ) {
            wc_add_notice( esc_html( $d['message'] ), 'error' );
        } elseif ( $d['warn'] ) {
            wc_add_notice( esc_html( $d['message'] ), 'notice' );
        }
    }

    // ── WooCommerce My Account registration ──────────────────────────────────

    public static function validate_woo_register( $errors, $username, $email ) {
        if ( $errors->get_error_code() ) {
            return $errors;
        }
        $d = self::get_decision( $email, 'woo_account' );
        if ( $d['block'] ) {
            $errors->add( 'leadcop_email_error', esc_html( $d['message'] ) );
        } elseif ( $d['warn'] ) {
            wc_add_notice( esc_html( $d['message'] ), 'notice' );
        }
        return $errors;
    }

    // ── Contact Form 7 ────────────────────────────────────────────────────────

    public static function validate_cf7_email( $result, $tag ) {
        $email = isset( $_POST[ $tag->name ] ) ? sanitize_email( wp_unslash( $_POST[ $tag->name ] ) ) : '';
        if ( ! $email ) {
            return $result;
        }
        $d = self::get_decision( $email, 'cf7' );
        if ( $d['block'] ) {
            $result->invalidate( $tag, esc_html( $d['message'] ) );
        } elseif ( $d['warn'] ) {
            self::$cf7_warn = $d['message'];
        }
        return $result;
    }

    public static function render_cf7_warn( $output, $class, $content, $form ) {
        if ( self::$cf7_warn && false !== strpos( $class, 'sent' ) ) {
            $output .= '<p class="leadcop-warn-msg" style="' . self::warn_style() . '">' . esc_html( self::$cf7_warn ) . '</p>';
            self::$cf7_warn = '';
        }
        return $output;
    }

    // ── WPForms ───────────────────────────────────────────────────────────────

    public static function validate_wpforms_email( $field_id, $field_submit, $form_data ) {
        $email = sanitize_email( $field_submit );
        if ( ! $email ) {
            return;
        }
        $d = self::get_decision( $email, 'wpforms' );
        if ( $d['block'] ) {
            wpforms()->process->errors[ $form_data['id'] ][ $field_id ] = esc_html( $d['message'] );
        } elseif ( $d['warn'] ) {
            self::$wpforms_warn[ $form_data['id'] ] = $d['message'];
        }
    }

    public static function render_wpforms_warn( $message, $form_data, $fields, $entry_id ) {
        $form_id = $form_data['id'];
        if ( ! empty( self::$wpforms_warn[ $form_id ] ) ) {
            $warn = self::$wpforms_warn[ $form_id ];
            unset( self::$wpforms_warn[ $form_id ] );
            $message .= '<p class="leadcop-warn-msg" style="' . self::warn_style() . '">' . esc_html( $warn ) . '</p>';
        }
        return $message;
    }

    // ── Gravity Forms ─────────────────────────────────────────────────────────

    public static function validate_gravity_email( $result, $value, $form, $field ) {
        if ( $field->type !== 'email' ) {
            return $result;
        }
        $email = sanitize_email( $value );
        if ( ! $email ) {
            return $result;
        }
        $d = self::get_decision( $email, 'gravity_forms' );
        if ( $d['block'] ) {
            $result['is_valid'] = false;
            $result['message']  = esc_html( $d['message'] );
        } elseif ( $d['warn'] ) {
            self::$gf_warn[ $form['id'] ] = $d['message'];
        }
        return $result;
    }

    public static function render_gravity_warn( $confirmation, $form, $entry, $ajax ) {
        $form_id = $form['id'];
        if ( ! empty( self::$gf_warn[ $form_id ] ) ) {
            $warn   = self::$gf_warn[ $form_id ];
            unset( self::$gf_warn[ $form_id ] );
            $inline = '<p class="leadcop-warn-msg" style="' . self::warn_style() . '">' . esc_html( $warn ) . '</p>';
            if ( is_array( $confirmation ) ) {
                if ( isset( $confirmation['message'] ) ) {
                    $confirmation['message'] .= $inline;
                }
            } else {
                $confirmation .= $inline;
            }
        }
        return $confirmation;
    }

    // ── Elementor Pro Forms ───────────────────────────────────────────────────

    /**
     * @param \ElementorPro\Modules\Forms\Classes\Form_Record $record
     * @param \ElementorPro\Modules\Forms\Classes\Ajax_Handler $ajax_handler
     */
    public static function validate_elementor_form( $record, $ajax_handler ) {
        $fields = $record->get_field( array( 'type' => 'email' ) );
        if ( empty( $fields ) ) {
            return;
        }
        foreach ( $fields as $id => $field ) {
            $email = sanitize_email( $field['value'] );
            if ( ! $email ) {
                continue;
            }
            $d = self::get_decision( $email, 'elementor_forms' );
            if ( $d['block'] ) {
                $ajax_handler->add_error( $id, esc_html( $d['message'] ) );
            } elseif ( $d['warn'] ) {
                self::set_generic_warn_cookie( $d['message'] );
            }
        }
    }

    // ── Ninja Forms ───────────────────────────────────────────────────────────

    public static function validate_ninjaforms( $form_data ) {
        foreach ( $form_data['fields'] as $key => $field ) {
            if ( ! in_array( $field['type'], array( 'email', 'email-confirm' ), true ) ) {
                continue;
            }
            $email = sanitize_email( isset( $field['value'] ) ? $field['value'] : '' );
            if ( ! $email ) {
                continue;
            }
            $d = self::get_decision( $email, 'ninja_forms' );
            if ( $d['block'] ) {
                $form_data['errors']['fields'][ $field['id'] ] = esc_html( $d['message'] );
            } elseif ( $d['warn'] ) {
                self::set_generic_warn_cookie( $d['message'] );
            }
        }
        return $form_data;
    }

    // ── Fluent Forms ──────────────────────────────────────────────────────────

    /**
     * @param  string|array $error   Existing error (string message or array).
     * @param  array        $field
     * @param  array        $formData
     * @param  array        $fields
     * @param  object       $form
     * @return string|array  Error message or original $error if clean.
     */
    public static function validate_fluentforms_email( $error, $field, $formData, $fields, $form ) {
        $field_key = $field['element'] ?? ( $field['raw']['element'] ?? '' );
        $email     = sanitize_email( $formData[ $field_key ] ?? '' );
        if ( ! $email ) {
            return $error;
        }
        $d = self::get_decision( $email, 'fluent_forms' );
        if ( $d['block'] ) {
            return esc_html( $d['message'] );
        }
        if ( $d['warn'] ) {
            self::set_generic_warn_cookie( $d['message'] );
        }
        return $error;
    }

    // ── Generic cookie-based warn (Elementor / Ninja / Fluent) ───────────────

    /**
     * Store a warn message in a short-lived cookie; rendered via wp_footer on
     * the next page the user lands on (or on the current page if not an AJAX
     * single-page form environment).
     */
    private static function set_generic_warn_cookie( $message ) {
        setcookie(
            'leadcop_gwarn',
            $message,
            time() + 120,
            defined( 'COOKIEPATH' ) ? COOKIEPATH : '/',
            defined( 'COOKIE_DOMAIN' ) ? COOKIE_DOMAIN : '',
            is_ssl(),
            true
        );
    }

    public static function render_generic_warn_footer() {
        if ( empty( $_COOKIE['leadcop_gwarn'] ) ) {
            return;
        }
        $msg = sanitize_text_field( wp_unslash( $_COOKIE['leadcop_gwarn'] ) );
        setcookie( 'leadcop_gwarn', '', time() - 3600, defined( 'COOKIEPATH' ) ? COOKIEPATH : '/' );
        $style = esc_js( self::warn_style() );
        $json  = wp_json_encode( $msg );
        echo "<script>
(function(){
    var msg=" . $json . ";
    var el=document.createElement('p');
    el.style.cssText='" . $style . "';
    el.textContent=msg;
    document.body.prepend(el);
})();
</script>\n";
    }
}
