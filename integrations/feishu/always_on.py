"""Durable Drover adapter for the existing owner-only Feishu bridge.

No todo commands/cards are routed here. Each incoming message is committed locally
before returning to the event consumer; server identities use the Feishu message ID.
"""
import hashlib
import json
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path


class AlwaysOn:
    def __init__(self, state, cfg, lark, log):
        self.state, self.cfg, self.lark, self.log = state, cfg, lark, log
        self.file = state / 'drover-always-on.sqlite'
        self.lock = threading.Lock()
        self.token, self.expiry = '', 0
        self.server_enabled = None
        with self.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS incoming(
                id TEXT PRIMARY KEY, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                target TEXT, created REAL NOT NULL, error TEXT);
                CREATE TABLE IF NOT EXISTS outgoing(id TEXT PRIMARY KEY, sent REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY,value TEXT NOT NULL);''')

    def db(self):
        db = sqlite3.connect(self.file, timeout=15)
        db.row_factory = sqlite3.Row
        return db

    def enabled(self):
        return self.cfg.get('always_on_enabled', False) and self.server_enabled is not False

    def accept(self, mid, text):
        if not self.enabled():
            return False
        cmd = text.lstrip('/').strip()
        if not cmd.startswith('批 ') and (
            cmd in ('帮助', 'help', '?', '？', '状态', 'status', '取消', 'cancel', 'stop',
                    '新会话', 'new', 'reset', '卡片', '选项', 'card')
            or re.match(r'^(整理)?(微信|飞书|会议)?待办|^todo\b', cmd)
            or re.match(r'^(执行|do)\s*[\dA-Za-z,，、\s]+$', cmd)
            or re.fullmatch(r'(\d+[A-Za-z][\s,，、]*)+', cmd)
        ):
            return False
        if not mid:
            raise ValueError('Missing Feishu message ID; cannot acknowledge durably')
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO incoming(id,text,created) VALUES(?,?,?)',
                       (mid, text, time.time()))
        return True

    def api(self, route, body=None, method=None):
        base = self.cfg.get('always_on_api', self.cfg.get('nexagent_api', 'http://127.0.0.1:3001'))

        def request(path, data=None, headers=None, verb=None):
            req = urllib.request.Request(base + path,
                data=json.dumps(data).encode('utf-8') if data is not None else None,
                headers={'Content-Type': 'application/json', **(headers or {})}, method=verb)
            with urllib.request.urlopen(req, timeout=15) as response:
                return json.load(response)
        with self.lock:
            if time.time() >= self.expiry:
                registration = json.loads(Path('D:/embodied/claudex-dot-20261023/primary-service.json').read_text(encoding='utf-8-sig'))
                key = (Path(registration['home']) / 'local-identity.key').read_text(encoding='utf-8').strip()
                ticket = request('/api/auth/local-ticket', {}, {'x-claudex-local-key': key})['ticket']
                self.token = request('/api/auth/local-exchange', {'ticket': ticket})['token']
                self.expiry = time.time() + 300
            token = self.token
        try:
            return request(route, body, {'Authorization': 'Bearer ' + token}, method).get('data')
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                self.expiry = 0
            raise

    def send_once(self, identity, text, card=None):
        with self.db() as db:
            if db.execute('SELECT 1 FROM outgoing WHERE id=?', (identity,)).fetchone():
                return
        # The remote key covers a crash between remote acceptance and local commit.
        key = hashlib.sha256(identity.encode()).hexdigest()[:48]
        args = ['im', '+messages-send', '--as', 'bot', '--user-id', self.cfg['owner_open_id']]
        if card is not None:
            try:
                self.lark(*args, '--msg-type', 'interactive', '--content', json.dumps(card, ensure_ascii=False), '--idempotency-key', key, timeout=30)
            except Exception as exc:
                self.log('审批卡片发送失败，使用文本兜底: ' + str(exc)[:200])
                self.lark(*args, '--text', text[:18000], '--idempotency-key', key, timeout=30)
        else:
            self.lark(*args, '--text', text[:18000], '--idempotency-key', key, timeout=30)
        with self.db() as db:
            db.execute('INSERT OR IGNORE INTO outgoing VALUES(?,?)', (identity, time.time()))

    def reset(self):
        if self.enabled():
            self.api('/api/always-on/bridge-session', {'reset': True})

    def step(self):
        snapshot = self.api('/api/always-on')
        self.server_enabled = snapshot['enabled']
        if not snapshot['enabled']:
            return  # Switch-off does not discard already accepted durable messages.
        with self.db() as db:
            incoming = list(db.execute("SELECT * FROM incoming WHERE status!='done' ORDER BY created LIMIT 100"))
        for row in incoming:
            try:
                match = re.fullmatch(r'批\s+([a-fA-F0-9]{6,32})\s+([\s\S]+)', row['text'].strip())
                if match:
                    short, answer = match.groups()
                    choices = [d for d in snapshot['decisions'] if d['id'].startswith(short.lower())]
                    if len(choices) != 1:
                        self.send_once('answer-error:' + row['id'], '待决事项编号不存在或不唯一，请使用通知中的完整短编号。')
                    else:
                        result = self.api('/api/always-on/decisions/' + choices[0]['id'] + '/answer',
                                          {'answer': answer, 'via': 'feishu'})
                        self.send_once('answer:' + row['id'], '已处理' if result['alreadyHandled'] else '已收到答复，将恢复原会话。')
                    with self.db() as db:
                        db.execute("UPDATE incoming SET status='done',error=NULL WHERE id=?", (row['id'],))
                    continue
                if not row['target']:
                    target = self.api('/api/always-on/bridge-session', {})['sessionId']
                    with self.db() as db:
                        db.execute('UPDATE incoming SET target=? WHERE id=?', (target, row['id']))
                else:
                    target = row['target']
                if row['status'] == 'pending':
                    self.api('/api/always-on/events', {'source': 'feishu', 'sourceId': row['id'],
                                                     'target': target, 'content': row['text']})
                    with self.db() as db:
                        db.execute("UPDATE incoming SET status='accepted',error=NULL WHERE id=?", (row['id'],))
                    self.send_once('ack:' + row['id'], '已收到，已存入 Drover 收件箱。')
                request_id = 'feishu:' + hashlib.sha256(row['id'].encode()).hexdigest()
                queue = self.api('/api/message-queue?sessionId=' + target)
                item = next((q for q in queue if q['request_id'] == request_id), None)
                if item and item['status'] not in ('queued', 'running'):
                    if item['status'] == 'succeeded':
                        history = self.api('/api/providers/sessions/' + target + '/messages')['messages']
                        messages = [m for m in history if m.get('role') == 'assistant' and m.get('kind') == 'text'
                                    and m.get('content') and m.get('timestamp', '') >= item['created_at']]
                        if not messages:
                            if not any(d['target'] == target and d['status'] == 'pending' for d in snapshot['decisions']):
                                continue  # Native transcript synchronization can lag durable completion.
                        else:
                            self.send_once('result:' + row['id'], messages[-1]['content'])
                    else:
                        self.send_once('result:' + row['id'], '执行未完成：' + str(item.get('error') or item['status']) + '。请在 Drover 收件箱查看；未自动重放有副作用的操作。')
                    with self.db() as db:
                        db.execute("UPDATE incoming SET status='done',error=NULL WHERE id=?", (row['id'],))
            except Exception as exc:
                with self.db() as db:
                    db.execute('UPDATE incoming SET error=? WHERE id=?', (str(exc)[:1000], row['id']))
                self.log('Drover 消息保留待重试 ' + row['id'] + ': ' + str(exc)[:300])
        for decision in snapshot['decisions']:
            if decision['status'] != 'pending':
                continue
            options = json.loads(decision['options'])
            text = ('【涉及真机/物理动作】\n' if decision['physical'] else '') + '需要你决定 · ' + decision['id']
            text += '\n来源会话：' + decision['target'] + '\n' + decision['question']
            text += '\n选项：' + json.dumps(options, ensure_ascii=False)
            text += '\n回复：批 ' + decision['id'] + ' <你的答复>\n未设置默认答复；等待期间其他任务继续。'
            self.send_once('decision:' + decision['id'], text, self.decision_card(decision, options, text))
            if decision['reminded_at']:
                self.send_once('reminder:' + decision['id'], '一次提醒：' + text)

    def accept_card(self, ev):
        if ev.get('operator_id') != self.cfg['owner_open_id'] or ev.get('action_tag') != 'button':
            return False
        try:
            value = json.loads(ev.get('action_value') or '{}')
        except (ValueError, TypeError):
            return False
        if value.get('action') != 'drover_decision':
            return False
        decision_id, answer = value.get('id', ''), value.get('answer')
        if not re.fullmatch(r'[a-f0-9]{12}', decision_id) or not isinstance(answer, str) or not answer.strip():
            return False
        # Commit the callback before bridge seen.json; an outage must not lose the answer.
        return self.accept('card:' + ev['event_id'], '批 ' + decision_id + ' ' + answer)

    @staticmethod
    def decision_card(decision, options, fallback):
        # Card 2.0 workflow: three blocks (question, source/fallback, explicit choices),
        # one question focus, weighted container, no selected/default value.
        choices = options
        if len(options) == 1 and isinstance(options[0], dict) and isinstance(options[0].get('options'), list):
            choices = options[0]['options']
        labels = [o.get('label', '') if isinstance(o, dict) else str(o) for o in choices]
        labels = [v for v in labels if v][:8]
        if not labels:
            return None  # Multiple questions/free text use the complete text reply.
        elements = [{'tag': 'markdown', 'content': '**' + decision['question'][:6000] + '**'},
            {'tag': 'column_set', 'flex_mode': 'none', 'background_style': 'grey-50', 'columns': [
                {'tag': 'column', 'width': 'weighted', 'weight': 1, 'padding': '8px', 'elements': [
                    {'tag': 'markdown', 'content': '来源：' + decision['target'] + '\n编号：' + decision['id'] + '\n按钮未响应时回复：批 ' + decision['id'] + ' <你的答复>\n没有默认选择；仅首次答复生效。', 'text_size': 'notation'}]}]}]
        for i, label in enumerate(labels):
            button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': label[:100]},
                'type': 'primary_filled' if i == 0 else 'default', 'behaviors': [{'type': 'callback',
                'value': {'action': 'drover_decision', 'id': decision['id'], 'answer': label}}]}
            if decision['physical']:
                button['confirm'] = {'title': {'tag': 'plain_text', 'content': '确认真机 / 物理动作答复'},
                    'text': {'tag': 'plain_text', 'content': '仅对本事项提交：' + label[:100]}}
            elements.append(button)
        return {'schema': '2.0', 'config': {'update_multi': True, 'width_mode': 'default'},
            'header': {'title': {'tag': 'plain_text', 'content': ('真机 / 物理动作 · ' if decision['physical'] else '') + '需要你决定'}, 'template': 'orange'},
            'body': {'direction': 'vertical', 'vertical_spacing': 'medium', 'elements': elements}}

    def watch(self):
        while True:
            try:
                if self.cfg.get('always_on_enabled', False):
                    self.step()
            except Exception as exc:
                self.log('Drover 连接暂不可用，消息保留：' + str(exc)[:300])
            time.sleep(3)
