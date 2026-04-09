<?php
defined( 'ABSPATH' ) || exit;

/**
 * Activity log: records every email check outcome in a lightweight DB table.
 * Maximum 1 000 rows are kept; older rows are pruned automatically.
 */
class LeadCop_Log {

    const TABLE_SUFFIX = 'leadcop_log';
    const MAX_ROWS     = 1000;

    public static function table_name() {
        global $wpdb;
        return $wpdb->prefix . self::TABLE_SUFFIX;
    }

    /**
     * Create (or upgrade) the log table. Safe to call on every activation.
     */
    public static function create_table() {
        global $wpdb;
        $table           = self::table_name();
        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            email varchar(254) NOT NULL DEFAULT '',
            outcome varchar(10) NOT NULL DEFAULT '',
            reason varchar(30) NOT NULL DEFAULT '',
            form varchar(100) NOT NULL DEFAULT '',
            checked_at datetime NOT NULL,
            PRIMARY KEY (id),
            KEY checked_at (checked_at)
        ) {$charset_collate};";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );
    }

    /**
     * Drop the log table (called on uninstall, not deactivation).
     */
    public static function drop_table() {
        global $wpdb;
        $wpdb->query( 'DROP TABLE IF EXISTS ' . self::table_name() ); // phpcs:ignore WordPress.DB.PreparedSQL
    }

    /**
     * Insert a log entry and prune oldest rows if the table exceeds MAX_ROWS.
     *
     * @param string $email
     * @param string $outcome  'blocked' | 'warned' | 'allowed'
     * @param string $reason   'disposable' | 'free_email' | 'no_mx' | 'blocklist' | 'allowlist' | ''
     * @param string $form     Human-readable form identifier (e.g. 'woo_checkout', 'cf7').
     */
    public static function insert( $email, $outcome, $reason, $form ) {
        global $wpdb;
        $table = self::table_name();

        $wpdb->insert(
            $table,
            array(
                'email'      => sanitize_email( $email ),
                'outcome'    => sanitize_key( $outcome ),
                'reason'     => sanitize_key( $reason ),
                'form'       => sanitize_text_field( $form ),
                'checked_at' => current_time( 'mysql' ),
            ),
            array( '%s', '%s', '%s', '%s', '%s' )
        );

        // Prune oldest rows so the table never grows unbounded.
        $count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ); // phpcs:ignore
        if ( $count > self::MAX_ROWS ) {
            $delete = $count - self::MAX_ROWS;
            $wpdb->query( $wpdb->prepare( "DELETE FROM {$table} ORDER BY id ASC LIMIT %d", $delete ) ); // phpcs:ignore
        }
    }

    /**
     * Return the most recent log entries (newest first).
     *
     * @param int $limit
     * @return array
     */
    public static function get_recent( $limit = 100 ) {
        global $wpdb;
        $table = self::table_name();
        return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY id DESC LIMIT %d", $limit ) ); // phpcs:ignore
    }

    /**
     * Counts for today broken down by outcome, keyed by outcome string.
     * e.g. [ 'blocked' => stdClass{outcome:'blocked', cnt:3}, ... ]
     *
     * @return array
     */
    public static function get_today_counts() {
        global $wpdb;
        $table = self::table_name();
        $today = current_time( 'Y-m-d' );
        $rows  = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT outcome, COUNT(*) AS cnt FROM {$table} WHERE DATE(checked_at) = %s GROUP BY outcome", // phpcs:ignore
                $today
            )
        );
        $indexed = array();
        foreach ( $rows as $row ) {
            $indexed[ $row->outcome ] = (int) $row->cnt;
        }
        return $indexed;
    }

    /**
     * Clear the entire log table.
     */
    public static function truncate() {
        global $wpdb;
        $wpdb->query( 'TRUNCATE TABLE ' . self::table_name() ); // phpcs:ignore
    }
}
