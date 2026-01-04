#!/usr/bin/env python3
"""
Script per estrarre nomi da sorgenti JavaScript
Usage: python js_extractor.py /path/to/project
"""

import argparse
import re
import os
import csv
import json
from datetime import datetime

class JavaScriptAnalyzer:
    def __init__(self):
        self.patterns = {
            'variable': [
                r'\b(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:function|\()'
            ],
            'function': [
                r'\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function\s*\(',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>'
            ],
            'class': [
                r'\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)'
            ],
            'method': [
                r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{',
                r'\bget\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\)',
                r'\bset\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)'
            ]
        }
    
    def analyze_file(self, filepath):
        results = []
        
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            lines = content.split('\n')
            filename = os.path.basename(filepath)
            
            for line_num, line in enumerate(lines, 1):
                # Salta commenti
                stripped = line.strip()
                if stripped.startswith('//') or stripped.startswith('/*'):
                    continue
                
                for entity_type, patterns in self.patterns.items():
                    for pattern in patterns:
                        matches = re.finditer(pattern, line)
                        for match in matches:
                            # Trova il gruppo che contiene il nome
                            for i in range(1, len(match.groups()) + 1):
                                if match.group(i) and match.group(i) not in ['var', 'let', 'const', 'function', 'class', 'get', 'set']:
                                    results.append({
                                        'file': filename,
                                        'path': filepath,
                                        'line': line_num,
                                        'column': match.start(i) + 1,
                                        'type': entity_type,
                                        'name': match.group(i),
                                        'context': line.strip()[:80]
                                    })
                                    break
        
        except Exception as e:
            print(f"  Errore: {e}")
        
        return results
    
    def analyze_project(self, project_path, output_format='csv'):
        print(f"Analisi progetto: {project_path}")
        print("-" * 50)
        
        all_results = []
        extensions = ('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs')
        
        for root, dirs, files in os.walk(project_path):
            # Ignora cartelle specifiche
            ignore_dirs = ['node_modules', '.git', 'dist', 'build', 'coverage']
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                if file.endswith(extensions):
                    filepath = os.path.join(root, file)
                    results = self.analyze_file(filepath)
                    if results:
                        print(f"✓ {file}: {len(results)} entità")
                        all_results.extend(results)
        
        # Genera output
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        if output_format == 'csv':
            output_file = f"js_analysis_{timestamp}.csv"
            self.save_csv(all_results, output_file)
        elif output_format == 'json':
            output_file = f"js_analysis_{timestamp}.json"
            self.save_json(all_results, output_file)
        elif output_format == 'both':
            self.save_csv(all_results, f"js_analysis_{timestamp}.csv")
            self.save_json(all_results, f"js_analysis_{timestamp}.json")
        
        return all_results
    
    def save_csv(self, data, filename):
        if not data:
            print("Nessun dato da salvare.")
            return
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            fieldnames = ['file', 'path', 'line', 'column', 'type', 'name', 'context']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        
        print(f"\nCSV salvato: {filename}")
    
    def save_json(self, data, filename):
        if not data:
            print("Nessun dato da salvare.")
            return
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'generated_at': datetime.now().isoformat(),
                    'total_entities': len(data)
                },
                'data': data
            }, f, indent=2, ensure_ascii=False)
        
        print(f"JSON salvato: {filename}")

def main():
    parser = argparse.ArgumentParser(description='Estrai nomi da sorgenti JavaScript')
    parser.add_argument('path', help='Percorso del progetto o file JavaScript')
    parser.add_argument('--format', choices=['csv', 'json', 'both'], default='csv',
                       help='Formato di output (default: csv)')
    parser.add_argument('--single', action='store_true',
                       help='Analizza solo un file singolo')
    
    args = parser.parse_args()
    analyzer = JavaScriptAnalyzer()
    
    if args.single:
        if os.path.isfile(args.path):
            results = analyzer.analyze_file(args.path)
            for r in results:
                print(f"{r['file']}:{r['line']}:{r['column']} [{r['type']}] {r['name']}")
        else:
            print("Il percorso specificato non è un file.")
    else:
        if os.path.isdir(args.path):
            analyzer.analyze_project(args.path, args.format)
        elif os.path.isfile(args.path):
            print("Usa --single per analizzare un singolo file.")
        else:
            print("Percorso non valido.")

if __name__ == "__main__":
    main()