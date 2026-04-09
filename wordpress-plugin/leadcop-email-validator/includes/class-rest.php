<?php
defined( 'ABSPATH' ) || exit;

/**
 * Registers a WP REST API endpoint so themes and other plugins can call
 * LeadCop without being tied to a specific form plugin.
 *
 * Endpoint: GET /wp-json/leadcop/v1/check?email=someone@example.com
 *
 * Authentication: Bearer <api-key> in the Authorization header,
 *                 or any logged-in user with manage_options capability.
 */
class LeadCop_REST {

    public static function init() {
        add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
    }

    public static function register_routes() {
        register_rest_route(
            'leadcop/v1',
            '/check',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( __CLASS__, 'check_email' ),
                'permission_callback' => array( __CLASS__, 'authenticate' ),
                'args'                => array(
                    'email' => array(
                        'required'          => true,
                        'type'              => 'string',
                        'sanitize_callback' => 'sanitize_email',
                        'validate_callback' => 'is_email',
                        'description'       => 'Email address to check.',
                    ),
                ),
            )
        );
    }

    /**
     * Allow requests that supply the site's LeadCop API key as a Bearer token,
     * or that come from a logged-in administrator.
     */
    public static function authenticate( WP_REST_Request $request ) {
        $auth = $request->get_header( 'Authorization' );
        if ( $auth ) {
            $token = trim( preg_replace( '/^Bearer\s+/i', '', $auth ) );
            if ( $token !== '' && $token === get_option( 'leadcop_api_key', '' ) ) {
                return true;
            }
        }
        return current_user_can( 'manage_options' );
    }

    public static function check_email( WP_REST_Request $request ) {
        $email = $request->get_param( 'email' );

        // Check local lists first
        $list_decision = LeadCop_API::check_lists( $email );
        if ( $list_decision !== null ) {
            return rest_ensure_response( array(
                'email'    => $email,
                'decision' => $list_decision['block'] ? 'blocked' : 'allowed',
                'reason'   => $list_decision['reason'],
                'message'  => $list_decision['message'],
                'cached'   => false,
                'source'   => 'local_list',
            ) );
        }

        $result = LeadCop_API::check_email( $email );

        if ( is_wp_error( $result ) ) {
            return new WP_Error(
                'leadcop_api_error',
                $result->get_error_message(),
                array( 'status' => 503 )
            );
        }

        $decision = LeadCop_API::evaluate( $result );

        return rest_ensure_response( array(
            'email'        => $email,
            'isDisposable' => ! empty( $result['isDisposable'] ),
            'isFreeEmail'  => ! empty( $result['isFreeEmail'] ),
            'mxValid'      => isset( $result['mxValid'] ) ? $result['mxValid'] : null,
            'decision'     => $decision['block'] ? 'blocked' : ( $decision['warn'] ? 'warned' : 'allowed' ),
            'reason'       => $decision['reason'],
            'message'      => $decision['message'],
            'cached'       => ! empty( $result['_cached'] ),
            'source'       => 'api',
        ) );
    }
}
