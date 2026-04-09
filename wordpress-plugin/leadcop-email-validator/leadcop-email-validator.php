<?php
/**
 * Plugin Name:       LeadCop Email Validator
 * Plugin URI:        https://leadcop.io
 * Description:       Block disposable and unwanted email addresses on your WordPress forms using the LeadCop API. Supports WooCommerce, Contact Form 7, WPForms, Gravity Forms, Elementor Forms, Ninja Forms, Fluent Forms, and more.
 * Version:           1.1.0
 * Requires at least: 5.6
 * Requires PHP:      7.4
 * Author:            LeadCop
 * Author URI:        https://leadcop.io
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       leadcop
 */

defined( 'ABSPATH' ) || exit;

define( 'LEADCOP_VERSION', '1.1.0' );
define( 'LEADCOP_PLUGIN_FILE', __FILE__ );
define( 'LEADCOP_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'LEADCOP_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once LEADCOP_PLUGIN_DIR . 'includes/class-api.php';
require_once LEADCOP_PLUGIN_DIR . 'includes/class-log.php';
require_once LEADCOP_PLUGIN_DIR . 'includes/class-rest.php';
require_once LEADCOP_PLUGIN_DIR . 'includes/class-admin.php';
require_once LEADCOP_PLUGIN_DIR . 'includes/class-hooks.php';

/**
 * Initialise the plugin after all plugins are loaded.
 */
function leadcop_init() {
    LeadCop_Admin::init();
    LeadCop_Hooks::init();
    LeadCop_REST::init();
}
add_action( 'plugins_loaded', 'leadcop_init' );

/**
 * Activation: set sensible defaults and create the log table.
 */
function leadcop_activate() {
    $defaults = array(
        'api_key'              => '',
        'api_url'              => 'https://leadcop.io',
        'block_disposable'     => '1',
        'free_email_action'    => 'off',
        'mx_action'            => 'off',
        'msg_disposable'       => __( 'Disposable email addresses are not allowed.', 'leadcop' ),
        'msg_free_email'       => __( 'Free email providers are not accepted. Please use a work email.', 'leadcop' ),
        'msg_mx'               => __( 'This email domain has no mail server — messages may not be delivered.', 'leadcop' ),
        'msg_blocklist'        => __( 'This email address is not accepted.', 'leadcop' ),
        'hook_wp_register'     => '1',
        'hook_wp_comment'      => '1',
        'hook_woo_checkout'    => '1',
        'hook_woo_account'     => '1',
        'hook_cf7'             => '1',
        'hook_wpforms'         => '1',
        'hook_gravityforms'    => '1',
        'hook_elementor'       => '1',
        'hook_ninjaforms'      => '1',
        'hook_fluentforms'     => '1',
        'allowlist'            => '',
        'blocklist'            => '',
        'enable_log'           => '1',
        'notify_admin'         => '0',
        'notify_email'         => '',
    );
    foreach ( $defaults as $key => $value ) {
        if ( false === get_option( 'leadcop_' . $key ) ) {
            add_option( 'leadcop_' . $key, $value );
        }
    }

    // Create the activity log table.
    LeadCop_Log::create_table();
}
register_activation_hook( __FILE__, 'leadcop_activate' );

/**
 * Deactivation: nothing to clean up.
 */
register_deactivation_hook( __FILE__, '__return_true' );

/**
 * Uninstall: remove all options and drop the log table.
 * This runs only when the user clicks "Delete" in the Plugins screen.
 */
function leadcop_uninstall() {
    $options = array(
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
    foreach ( $options as $key ) {
        delete_option( 'leadcop_' . $key );
    }
    LeadCop_Log::drop_table();
}
register_uninstall_hook( __FILE__, 'leadcop_uninstall' );
