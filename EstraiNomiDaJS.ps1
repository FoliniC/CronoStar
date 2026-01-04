#!/usr/bin/env python3
"""
Script per estrarre nomi da sorgenti JavaScript - Versione migliorata
"""

import re
import os
import csv
import json
from datetime import datetime
from pathlib import Path

class JavaScriptAnalyzerEnhanced:
    def __init__(self):
        self.patterns = {
            'class': [
                r'(?:export\s+|default\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:extends|\{|$)',
                r'(?:export\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)'
            ],
            'property': [
                # Proprietà LitElement: property: { type: Type }
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*\{\s*(?:type|attribute|reflect|state|converter)\s*:',
                # Proprietà in oggetti statici
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*\{\s*type\s*:\s*\w+\s*\}',
                # Variabili con underscore (private/convention)
                r'\b(_[a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?::|=\s*[^{])',
                # Proprietà in return di metodi statici
                r'\'([a-zA-Z_$][a-zA-Z0-9_$]*)\'\s*:\s*\{'
            ],
            'static_property': [
                r'static\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=',
                r'static\s+get\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
                r'static\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{'
            ],
            'variable': [
                r'\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:function|\([^)]*\)\s*=>|new\s+\w+)',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?:string|number|boolean|object|array|function)\b'
            ],
            'function': [
                r'\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function\s*\(',
                r'async\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\('
            ],
            'method': [
                r'\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{',
                r'\bget\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\)',
                r'\bset\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)',
                r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*=>'
            ],
            'export': [
                r'export\s+(?:default\s+)?(?:class|function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)',
                r'export\s+\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}'
            ]
        }
        
        # Pattern speciali per framework specifici
        self.special_patterns = {
            'litetemplate': [
                r'render\s*\(\)\s*\{',
                r'html\s*`([^`]*)`'
            ]
        }
    
    def extract_lit_element_properties(self, line):
        """Estrae specificamente le proprietà LitElement"""
        properties = []
        
        # Pattern per: property: { type: Type }
        lit_patterns = [
            r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*\{\s*type\s*:\s*(\w+)',
            r'\'([a-zA-Z_$][a-zA-Z0-9_$]*)\'\s*:\s*\{\s*type\s*:\s*(\w+)',
            r'"([a-zA-Z_$][a-zA-Z0-9_$]*)"\s*:\s*\{\s*type\s*:\s*(\w+)'
        ]
        
        for pattern in lit_patterns:
            matches = re.finditer(pattern, line)
            for match in matches:
                if match.group(1):
                    properties.append({
                        'name': match.group(1),
                        'type': match.group(2) if len(match.groups()) > 1 else 'Object'
                    })
        
        return properties
    
    def extract_es6_class_members(self, content, class_name=None):
        """Estrae membri di classe ES6 in modo più accurato"""
        members = []
        
        # Cerca il corpo della classe
        class_pattern = rf'class\s+{re.escape(class_name)}\s*{{(.*?)}}' if class_name else r'class\s+\w+\s*{{(.*?)}}'
        class_match = re.search(class_pattern, content, re.DOTALL)
        
        if class_match:
            class_body = class_match.group(1)
            lines = class_body.split('\n')
            
            for line in lines:
                line = line.strip()
                
                # Proprietà di classe (con o senza static)
                prop_match = re.search(r'(?:static\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:=|;|$)', line)
                if prop_match and prop_match.group(1) not in ['static', 'get', 'set', 'async']:
                    members.append({
                        'type': 'class_property',
                        'name': prop_match.group(1),
                        'static': 'static' in line,
                        'line': line
                    })
                
                # Metodi
                method_match = re.search(r'(?:static\s+|async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*(?:\{|=>)', line)
                if method_match:
                    members.append({
                        'type': 'method',
                        'name': method_match.group(1),
                        'static': 'static' in line,
                        'async': 'async' in line,
                        'line': line
                    })
        
        return members
    
    def analyze_file(self, filepath):
        results = []
        
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            lines = content.split('\n')
            filename = os.path.basename(filepath)
            
            # Prima passata: cerca classi per analisi contestuale
            classes_in_file = []
            for line_num, line in enumerate(lines, 1):
                class_matches = re.finditer(r'class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)', line)
                for match in class_matches:
                    if match.group(1):
                        classes_in_file.append({
                            'name': match.group(1),
                            'line': line_num
                        })
            
            # Seconda passata: analisi dettagliata
            for line_num, line in enumerate(lines, 1):
                line_trimmed = line.strip()
                
                # Salta commenti
                if line_trimmed.startswith('//') or line_trimmed.startswith('/*') or line_trimmed.startswith('*'):
                    continue
                
                # 1. Estrai proprietà LitElement specifiche
                lit_properties = self.extract_lit_element_properties(line)
                for prop in lit_properties:
                    results.append({
                        'file': filename,
                        'path': filepath,
                        'line': line_num,
                        'column': line.find(prop['name']) + 1,
                        'type': 'lit_property',
                        'name': prop['name'],
                        'subtype': prop['type'],
                        'context': line.strip()[:100]
                    })
                
                # 2. Pattern generali
                for entity_type, patterns in self.patterns.items():
                    for pattern in patterns:
                        matches = re.finditer(pattern, line)
                        for match in matches:
                            # Trova il gruppo che contiene il nome
                            for i in range(1, len(match.groups()) + 1):
                                if match.group(i):
                                    name = match.group(i)
                                    # Filtra parole chiave
                                    if name.lower() not in ['type', 'attribute', 'reflect', 'state', 'converter', 
                                                           'static', 'async', 'get', 'set', 'export', 'default']:
                                        results.append({
                                            'file': filename,
                                            'path': filepath,
                                            'line': line_num,
                                            'column': match.start(i) + 1,
                                            'type': entity_type,
                                            'name': name,
                                            'context': line.strip()[:100]
                                        })
                                    break
                
                # 3. Pattern speciali per variabili con underscore (private)
                underscore_patterns = [
                    r'this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=;]',
                    r'this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)',
                    r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*this\.'
                ]
                
                for pattern in underscore_patterns:
                    matches = re.finditer(pattern, line)
                    for match in matches:
                        if match.group(1):
                            results.append({
                                'file': filename,
                                'path': filepath,
                                'line': line_num,
                                'column': match.start(1) + 1,
                                'type': 'this_property',
                                'name': match.group(1),
                                'context': line.strip()[:100]
                            })
            
            # Analisi contestuale delle classi trovate
            for class_info in classes_in_file:
                class_members = self.extract_es6_class_members(content, class_info['name'])
                for member in class_members:
                    results.append({
                        'file': filename,
                        'path': filepath,
                        'line': class_info['line'],
                        'column': 1,
                        'type': member['type'],
                        'name': f"{class_info['name']}.{member['name']}",
                        'subtype': 'static' if member.get('static') else 'instance',
                        'context': member['line'][:100]
                    })
        
        except Exception as e:
            print(f"  Errore: {e}")
        
        return results
    
    def analyze_project(self, project_path, output_format='csv'):
        print(f"Analisi progetto: {project_path}")
        print("-" * 60)
        
        all_results = []
        extensions = ('.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs')
        file_count = 0
        
        for root, dirs, files in os.walk(project_path):
            # Ignora cartelle specifiche
            ignore_dirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '.vscode', '__pycache__']
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                if file.endswith(extensions):
                    filepath = os.path.join(root, file)
                    results = self.analyze_file(filepath)
                    if results:
                        file_count += 1
                        entity_count = len(results)
                        print(f"✓ {file:<30} {entity_count:4} entità")
                        all_results.extend(results)
        
        print("-" * 60)
        print(f"Totale file analizzati: {file_count}")
        print(f"Totale entità trovate: {len(all_results)}")
        
        # Statistiche
        if all_results:
            from collections import Counter
            types_counter = Counter([e['type'] for e in all_results])
            print("\nStatistiche per tipo:")
            for type_name, count in types_counter.most_common():
                percentage = (count / len(all_results)) * 100
                print(f"  {type_name:<20} {count:4} ({percentage:5.1f}%)")
        
        # Genera output
        if all_results:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            if output_format == 'csv':
                output_file = f"js_analysis_{timestamp}.csv"
                self.save_csv_pipe_pipe(all_results, output_file)
            elif output_format == 'json':
                output_file = f"js_analysis_{timestamp}.json"
                self.save_json(all_results, output_file)
            elif output_format == 'both':
                self.save_csv_pipe_pipe(all_results, f"js_analysis_{timestamp}.csv")
                self.save_json(all_results, f"js_analysis_{timestamp}.json")
        
        return all_results
    
    def save_csv_pipe(self, data, filename):
        if not data:
            print("Nessun dato da salvare.")
            return
        
        # Determina tutte le chiavi possibili
        all_keys = set()
        for item in data:
            all_keys.update(item.keys())
        
        # Ordina le chiavi
        fieldnames = sorted(all_keys)
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        
        print(f"\nCSV salvato: {filename}")
        print(f"Righe: {len(data)}")
        print(f"Campi: {len(fieldnames)}")
    def save_csv_pipe_pipe(self, data, filename, delimiter='||'):
        """Salva CSV con separatore personalizzato (2 pipe)"""
        if not data:
            print("Nessun dato da salvare.")
            return
        
        # Determina tutte le chiavi possibili
        all_keys = set()
        for item in data:
            all_keys.update(item.keys())
        
        # Ordina le chiavi in un ordine logico
        preferred_order = ['file', 'path', 'line', 'column', 'type', 'name', 'subtype', 'context']
        other_keys = sorted([k for k in all_keys if k not in preferred_order])
        fieldnames = preferred_order + other_keys
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            # Usa il separatore personalizzato
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter='|')
            
            # Scrivi una riga di commento con il separatore utilizzato
            f.write(f"# Separator: {delimiter}\n")
            f.write(f"# Generated: {datetime.now().isoformat()}\n")
            f.write(f"# Total records: {len(data)}\n")
            
            writer.writeheader()
            
            # Scrivi i dati con doppio pipe come separatore effettivo
            for row in data:
                # Converti tutti i valori in stringhe
                formatted_row = {}
                for key in fieldnames:
                    value = row.get(key, '')
                    # Sostituisci pipe esistenti per evitare conflitti
                    if isinstance(value, str):
                        value = value.replace('|', '¦')  # Sostituisce pipe con un carattere alternativo
                    formatted_row[key] = value
                
                # Scrive la riga con il writer CSV standard
                writer.writerow(formatted_row)
        
        print(f"\nCSV (pipe-separated) salvato: {filename}")
        print(f"Righe: {len(data)}")
        print(f"Separatore: '{delimiter}'")

    def save_csv_pipe_double_pipe(self, data, filename):
        """Salva con doppio pipe come separatore (metodo manuale)"""
        if not data:
            print("Nessun dato da salvare.")
            return
        
        # Determina tutte le chiavi possibili
        all_keys = set()
        for item in data:
            all_keys.update(item.keys())
        
        # Ordina le chiavi
        preferred_order = ['file', 'path', 'line', 'column', 'type', 'name', 'subtype', 'context']
        other_keys = sorted([k for k in all_keys if k not in preferred_order])
        fieldnames = preferred_order + other_keys
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            # Intestazione
            f.write('# JavaScript Analysis Report\n')
            f.write(f'# Generated: {datetime.now().isoformat()}\n')
            f.write(f'# Total entities: {len(data)}\n')
            f.write(f'# File count: {len(set([d["file"] for d in data]))}\n')
            f.write('# Fields: ' + ' || '.join(fieldnames) + '\n')
            f.write('#' + '='*80 + '\n')
            
            # Dati
            for row in data:
                values = []
                for field in fieldnames:
                    value = str(row.get(field, ''))
                    # Escape pipe esistenti e newline
                    value = value.replace('|', '¦').replace('\n', '\\n').replace('\r', '\\r')
                    values.append(value)
                
                # Scrivi con doppio pipe come separatore
                f.write(' || '.join(values) + '\n')
        
        print(f"\nFile salvato: {filename}")
        print(f"Formato: Pipe-separated (||)")
        print(f"Records: {len(data)}")

    
    def save_json(self, data, filename):
        if not data:
            print("Nessun dato da salvare.")
            return
        
        # Crea struttura organizzata
        organized = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'total_entities': len(data),
                'file_count': len(set([d['file'] for d in data])),
                'entity_types': {}
            },
            'files': {},
            'entities_by_type': {}
        }
        
        # Calcola statistiche
        from collections import Counter, defaultdict
        type_counter = Counter([d['type'] for d in data])
        organized['metadata']['entity_types'] = dict(type_counter)
        
        # Organizza per file
        for entity in data:
            filename_key = entity['file']
            if filename_key not in organized['files']:
                organized['files'][filename_key] = []
            organized['files'][filename_key].append(entity)
            
            # Organizza per tipo
            entity_type = entity['type']
            if entity_type not in organized['entities_by_type']:
                organized['entities_by_type'][entity_type] = []
            organized['entities_by_type'][entity_type].append(entity)
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(organized, f, indent=2, ensure_ascii=False)
        
        print(f"JSON salvato: {filename}")
        print(f"Struttura: {len(organized['files'])} file, {len(organized['entities_by_type'])} tipi di entità")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Estrai nomi da sorgenti JavaScript - Versione migliorata',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Esempi:
  %(prog)s /percorso/progetto              # Analizza tutto il progetto
  %(prog)s file.js --single               # Analizza un singolo file
  %(prog)s . --format json               # Output in JSON
  %(prog)s . --filter lit_property       # Filtra per tipo
        """
    )
    
    parser.add_argument('path', help='Percorso del progetto o file JavaScript')
    parser.add_argument('--format', choices=['csv', 'json', 'both'], default='csv',
                       help='Formato di output (default: csv)')
    parser.add_argument('--single', action='store_true',
                       help='Analizza solo un file singolo')
    parser.add_argument('--filter', help='Filtra per tipo di entità (es: lit_property, class, function)')
    parser.add_argument('--output', help='Nome personalizzato per il file di output')
    
    args = parser.parse_args()
    analyzer = JavaScriptAnalyzerEnhanced()
    
    if args.single:
        if os.path.isfile(args.path):
            print(f"Analisi file: {args.path}")
            results = analyzer.analyze_file(args.path)
            
            if args.filter:
                results = [r for r in results if r['type'] == args.filter]
            
            # Mostra risultati
            print("\n" + "="*80)
            print(f"ENTITÀ TROVATE: {len(results)}")
            print("="*80)
            
            for r in results:
                context = r['context'][:50] + '...' if len(r['context']) > 50 else r['context']
                print(f"{r['file']}:{r['line']}:{r['column']} [{r['type']:15}] {r['name']:30} {context}")
            
            # Salva se richiesto
            if results and (args.output or args.format):
                if args.output:
                    output_file = args.output
                else:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    output_file = f"js_analysis_{timestamp}.csv"
                
                if args.format == 'csv' or not args.format:
                    analyzer.save_csv_pipe(results, output_file)
                elif args.format == 'json':
                    analyzer.save_json(results, output_file)
                elif args.format == 'both':
                    analyzer.save_csv_pipe(results, f"{output_file}.csv")
                    analyzer.save_json(results, f"{output_file}.json")
        else:
            print("Il percorso specificato non è un file.")
    else:
        if os.path.isdir(args.path):
            results = analyzer.analyze_project(args.path, args.format)
            
            # Filtra se richiesto
            if args.filter and results:
                filtered = [r for r in results if r['type'] == args.filter]
                print(f"\nEntità filtrate per '{args.filter}': {len(filtered)}")
                
                if args.output and filtered:
                    if args.format == 'csv' or not args.format:
                        analyzer.save_csv_pipe(filtered, args.output)
                    elif args.format == 'json':
                        analyzer.save_json(filtered, args.output)
        elif os.path.isfile(args.path):
            print("Usa --single per analizzare un singolo file.")
        else:
            print("Percorso non valido.")

if __name__ == "__main__":
    main()