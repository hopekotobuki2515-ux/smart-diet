<?php
/*
 * Rename this file to config.local.php ON SAKURA ONLY, never commit a live password hash.
 * Generate the hash in a PHP terminal:
 * php -r 'echo password_hash("YOUR_UNIQUE_LONG_PASSWORD", PASSWORD_DEFAULT), PHP_EOL;'
 * Replace the placeholder below. HTTPS is mandatory on production.
 */
return [
    'trainer_password_hash' => 'REPLACE_WITH_PASSWORD_HASH_FROM_PASSWORD_HASH',
];
