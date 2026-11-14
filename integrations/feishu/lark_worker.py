"""Runs inside conhost --headless; native stdout/stderr remain machine readable."""
import json
import os
import subprocess
import sys
from pathlib import Path
job = Path(sys.argv[1])
spec = json.loads(job.read_text(encoding='utf-8'))
with open(spec['out'], 'wb') as stdout, open(spec['err'], 'wb') as stderr:
    proc = subprocess.Popen(spec['args'], stdin=subprocess.PIPE, stdout=stdout, stderr=stderr,
                            cwd=spec['cwd'], env=os.environ, creationflags=0x08000000)
    try:
        code = proc.wait(timeout=spec.get('timeout'))
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait(timeout=10)
        code = 124
Path(spec['result']).write_text(json.dumps({'exitCode': code}), encoding='utf-8')
