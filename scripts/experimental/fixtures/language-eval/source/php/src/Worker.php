<?php
namespace Eval\Worker;

class Worker {
    public function run(array $payload): array {
        if (($payload['kind'] ?? '') === 'report') {
            return ['ok' => true];
        }
        return ['ok' => false];
    }
}
