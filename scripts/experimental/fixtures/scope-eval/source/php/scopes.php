<?php
function execute_primary() {
    $options = [
        'mode' => 'primary',
        'retries' => 3,
    ];
    return $options['mode'];
}

function execute_secondary() {
    $options = [
        'mode' => 'secondary',
        'retries' => 7,
    ];
    return $options['mode'];
}
