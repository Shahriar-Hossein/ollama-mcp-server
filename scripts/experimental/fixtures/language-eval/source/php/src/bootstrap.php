<?php
namespace Eval\App;
use Eval\Worker\Worker as ReportRunner;

$settings = require __DIR__ . '/../config.php';
$runner = new ReportRunner();
if (($settings['REPORTS_ENABLED'] ?? '0') === '1') {
    $runner->run(['kind' => 'report']);
}
if (($settings['AUDIT_ENABLED'] ?? '0') === '1') {
    $runner->run(['kind' => 'audit']);
}
