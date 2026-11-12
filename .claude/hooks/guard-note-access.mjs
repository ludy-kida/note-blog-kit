#!/usr/bin/env node
/**
 * PreToolUse hook: エージェントによる note.com へのアクセスを止める。
 * .claude/settings.json の禁止ルールとの二重の止め。exit 2 でツール呼び出しをブロックする。
 *
 * ブロックするもの
 * - WebFetch で note.com / note.mu / st-note.com（とそのサブドメイン）を開く
 * - Bash で上記ドメインの URL を含むコマンド
 * - Bash でネットワーク系コマンド（curl・wget など）と上記ドメインを同時に含むコマンド
 * - Bash で fixture 取得スクリプトを実行するコマンド（--dry-run を除く。実行は人だけが行う）
 *
 * 入力: 標準入力に Claude Code の hook JSON（tool_name, tool_input）
 */
import { fileURLToPath } from 'node:url';

const NOTE_DOMAIN = String.raw`(?:[a-z0-9-]+\.)*(?:note\.com|note\.mu|st-note\.com)`;
const NOTE_URL_RE = new RegExp(String.raw`\b(?:https?|wss?)://${NOTE_DOMAIN}(?![a-z0-9.-])`, 'i');
const NOTE_DOMAIN_RE = new RegExp(String.raw`(?<![a-z0-9.-])${NOTE_DOMAIN}(?![a-z0-9.-])`, 'i');
const NETWORK_TOOL_RE =
  /(?<![\w./-])(?:curl|wget|http|https|httpie|xh|aria2c|nc|ncat|telnet|openssl|lynx|w3m|links)(?![\w-])|\bfetch\s*\(|\bhttps?\.(?:get|request)\s*\(|\brequests\.(?:get|post|head|request)\b|\burllib\b|\bInvoke-WebRequest\b/i;
const RECORD_SCRIPT_RE = /record-fixtures|fixtures:record/i;
const DRY_RUN_RE = /(?:^|\s)--dry-run(?:\s|$)/;

const NOTE_HOST_RE = /(?:^|\.)(?:note\.com|note\.mu|st-note\.com)$/i;

/**
 * @param {{ tool_name?: string, tool_input?: Record<string, unknown> }} input
 * @returns {string | null} ブロックする理由。許可するなら null
 */
export function check(input) {
  const tool = input?.tool_name;
  const toolInput = input?.tool_input ?? {};

  if (tool === 'WebFetch') {
    const url = typeof toolInput.url === 'string' ? toolInput.url : '';
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      host = '';
    }
    if (NOTE_HOST_RE.test(host) || NOTE_URL_RE.test(url)) {
      return 'note.com への直接アクセスは禁止です。テストには fixtures/ の保存済みレスポンスを使ってください。';
    }
    return null;
  }

  if (tool === 'Bash') {
    const command = typeof toolInput.command === 'string' ? toolInput.command : '';
    if (RECORD_SCRIPT_RE.test(command) && !DRY_RUN_RE.test(command)) {
      return 'fixture 取得スクリプトは人が端末から実行します。エージェントは --dry-run での確認だけ行えます。';
    }
    if (NOTE_URL_RE.test(command)) {
      return 'note.com の URL を含むコマンドは実行できません。テストには fixtures/ の保存済みレスポンスを使ってください。';
    }
    if (NETWORK_TOOL_RE.test(command) && NOTE_DOMAIN_RE.test(command)) {
      return 'note.com へのリクエストを含むコマンドは実行できません。';
    }
    return null;
  }

  return null;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    // 入力が読めない場合は判定できないため止める（安全側）
    process.stderr.write('guard-note-access: hook の入力を JSON として読めませんでした。\n');
    process.exit(2);
  }
  const reason = check(input);
  if (reason !== null) {
    process.stderr.write(`${reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
