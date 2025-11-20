# Filesystem MCP Server

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md) [![Türkçe](https://img.shields.io/badge/lang-Türkçe-red.svg)](README.tr.md)

Birleşik araç mimarisiyle kapsamlı dosya sistemi işlemleri için Model Context Protocol (MCP) uygulayan kurumsal düzeyde Node.js sunucusu.

## Özellikler

- **Birleşik Araç Mimarisi**: LLM verimliliği için 48 yerine 10 güçlü araç
- **%100 Tip Güvenliği**: Zod validasyonu ile strict TypeScript, sıfır `any` tipi
- **Kapsamlı Dosya İşlemleri**: Birden fazla mod ile okuma, yazma, düzenleme, kopyalama, taşıma, silme
- **Gelişmiş Arama**: Dosya arama, içerik arama ve bulanık eşleştirme
- **Git Entegrasyonu**: Status, log, diff, branch, show ve blame işlemleri
- **Sıkıştırma & Hash**: Gzip/Brotli sıkıştırma, çoklu hash algoritmaları
- **Yedekleme & Birleştirme**: Dosya versiyonlama, yedek rotasyonu, text/JSON birleştirme
- **Doğrulama**: TypeScript, JavaScript, JSON için sözdizimi kontrolü ve linting
- **Dinamik Erişim Kontrolü**: CLI argümanları veya MCP Roots ile esnek dizin izinleri

## Mimari

### Birleşik Araçlar (Toplam 10)

Tüm araçlar, tek bir arayüz üzerinden birden fazla yetenğe erişmek için `type`, `mode` veya `operation` parametreleriyle birleşik bir desen kullanır, bu da token maliyetini azaltır ve LLM anlayışını iyileştirir.

## Dizin Erişim Kontrolü

Sunucu esnek bir dizin erişim kontrol sistemi kullanır. Dizinler komut satırı argümanları veya dinamik olarak [Roots](https://modelcontextprotocol.io/docs/learn/client-concepts#roots) üzerinden belirtilebilir.

### Yöntem 1: Komut Satırı Argümanları
Sunucuyu başlatırken izinli dizinleri belirtin:
```bash
mcp-server-filesystem /path/to/dir1 /path/to/dir2
```

### Yöntem 2: MCP Roots (Önerilen)
[Roots](https://modelcontextprotocol.io/docs/learn/client-concepts#roots) destekleyen MCP istemcileri izinli dizinleri dinamik olarak güncelleyebilir.

**Önemli**: Sunucu komut satırı argümanları olmadan başlarsa VE istemci roots protokolünü desteklemiyorsa, sunucu başlatma sırasında hata verecektir.

### Nasıl Çalışır

1. **Sunucu Başlatma**: Komut satırı argümanlarından dizinlerle başlar (sağlanmışsa)
2. **İstemci Bağlantısı**: İstemci bağlanır ve `initialize` isteği gönderir
3. **Roots Protokolü**:
   - Sunucu istemciden `roots/list` ile roots ister
   - İstemci yapılandırılmış roots ile yanıt verir
   - Sunucu TÜM izinli dizinleri istemcinin roots'ları ile değiştirir
   - `notifications/roots/list_changed` ile çalışma zamanı güncellemeleri
4. **Erişim Kontrolü**: Tüm işlemler izinli dizinlerle sınırlıdır

## API Referansı

### 1. read - Birleşik Okuma İşlemleri

Tek bir araçta birden fazla mod ile dosya okuma.

**Parametreler:**
- `type`: `'text'` | `'binary'` | `'media'` | `'multiple'` (varsayılan: `'text'`)
- `path`: string (tek dosya için)
- `paths`: string[] (birden fazla dosya için)
- `encoding`: `'utf8'` | `'utf16le'` | `'ascii'` | `'latin1'` | `'base64'` | `'hex'`
- `head`: number (ilk N satır)
- `tail`: number (son N satır)
- `lineRange`: { start: number, end: number }
- `stream`: boolean (büyük dosyaları akış ile oku)
- `includeMetadata`: boolean

**Örnekler:**
```typescript
// Metin dosyası
{ type: 'text', path: '/file.txt', head: 10 }

// Binary dosya
{ type: 'binary', path: '/image.png' }

// Birden fazla dosya
{ type: 'multiple', paths: ['/a.txt', '/b.txt'] }

// Base64 ile medya
{ type: 'media', path: '/photo.jpg' }
```

### 2. write - Birleşik Yazma İşlemleri

Tek, toplu veya şablon modlarıyla dosya yazma.

**Parametreler:**
- `mode`: `'single'` | `'batch'` | `'template'` (varsayılan: `'single'`)
- `path`: string (tek/şablon için)
- `content`: string (tek için)
- `operations`: Array<{ path, content, encoding }> (toplu için)
- `template`: string ({{değişkenler}} ile şablon içeriği)
- `variables`: Record<string, string> (şablon için)
- `append`: boolean
- `atomic`: boolean (geçici dosya + yeniden adlandır)
- `backup`: boolean
- `encoding`: string

**Örnekler:**
```typescript
// Tek yazma
{ mode: 'single', path: '/file.txt', content: 'Merhaba' }

// Toplu yazma (3 dosya birden)
{ mode: 'batch', operations: [
  { path: '/a.txt', content: 'A' },
  { path: '/b.txt', content: 'B' },
  { path: '/c.txt', content: 'C' }
]}

// Şablon yazma
{ mode: 'template', path: '/config.json',
  template: '{"name": "{{name}}", "version": "{{version}}"}',
  variables: { name: 'UygulamaBenim', version: '1.0' }
}
```

### 3. file - Birleşik Dosya İşlemleri

Tek bir araç üzerinden çeşitli dosya işlemleri gerçekleştirme.

**Parametreler:**
- `operation`: `'edit'` | `'mkdir'` | `'move'` | `'copy'` | `'delete'`
- `path`: string (hedef yol)
- `source`: string (taşıma/kopyalama için)
- `destination`: string (taşıma/kopyalama için)
- `edits`: Array<{ oldText, newText, useRegex, flags }> (düzenleme için)
- `recursive`: boolean
- `dryRun`: boolean (düzenlemeleri önizle)
- `overwrite`: boolean

**Örnekler:**
```typescript
// Dosya düzenle
{ operation: 'edit', path: '/file.ts',
  edits: [{ oldText: 'const', newText: 'let' }],
  dryRun: true
}

// Dizin oluştur
{ operation: 'mkdir', path: '/yeni-dizin', recursive: true }

// Dosya kopyala
{ operation: 'copy', source: '/a.txt', destination: '/b.txt' }

// Dosya taşı
{ operation: 'move', source: '/eski.txt', destination: '/yeni.txt' }

// Özyinelemeli sil
{ operation: 'delete', path: '/dizin', recursive: true }
```

### 4. list - Birleşik Dizin Listeleme

Birden fazla görüntüleme moduyla dizin içeriğini listeleme.

**Parametreler:**
- `mode`: `'simple'` | `'detailed'` | `'tree'` | `'recursive'` (varsayılan: `'simple'`)
- `path`: string
- `pattern`: string (glob deseni)
- `includeHidden`: boolean
- `includeSize`: boolean
- `includePermissions`: boolean
- `sortBy`: `'name'` | `'size'` | `'mtime'` | `'atime'`
- `maxDepth`: number
- `page`: number
- `pageSize`: number

**Örnekler:**
```typescript
// Basit liste
{ mode: 'simple', path: '/dizin', pattern: '*.ts' }

// Boyutlarla detaylı
{ mode: 'detailed', path: '/dizin', includeSize: true, sortBy: 'size' }

// Ağaç görünümü
{ mode: 'tree', path: '/dizin', maxDepth: 3 }

// Sayfalama ile özyinelemeli
{ mode: 'recursive', path: '/dizin', page: 1, pageSize: 100 }
```

### 5. search - Birleşik Arama İşlemleri

Dosya arama, içerik arama veya bulanık eşleştirme.

**Parametreler:**
- `type`: `'files'` | `'content'` | `'fuzzy'` (varsayılan: `'files'`)
- `path`: string (başlangıç dizini)
- `pattern`: string (dosya araması için)
- `query`: string (içerik/bulanık arama için)
- `caseSensitive`: boolean
- `useRegex`: boolean
- `maxDepth`: number
- `maxResults`: number
- `fileTypes`: string[]
- `excludePatterns`: string[]
- `threshold`: number (0-1, bulanık için)
- `contextLines`: number (içerik araması için)

**Örnekler:**
```typescript
// Dosya araması
{ type: 'files', path: '/src', pattern: '*.ts', maxDepth: 5 }

// İçerik araması
{ type: 'content', path: '/src', query: 'TODO', contextLines: 2 }

// Bulanık arama
{ type: 'fuzzy', path: '/src', query: 'usr', threshold: 0.7 }
```

### 6. info - Birleşik Dosya Bilgisi

Dosya/dizin metadata, MIME tipleri, disk kullanımı veya sembolik link bilgisi.

**Parametreler:**
- `type`: `'metadata'` | `'mime'` | `'disk-usage'` | `'symlink'` (varsayılan: `'metadata'`)
- `path`: string
- `includeExtended`: boolean (metadata için)
- `recursive`: boolean (disk-usage için)
- `maxDepth`: number
- `sortBy`: `'size'` | `'name'`
- `limit`: number

**Örnekler:**
```typescript
// Metadata
{ type: 'metadata', path: '/file.txt', includeExtended: true }

// MIME tipi
{ type: 'mime', path: '/image.png' }

// Disk kullanımı
{ type: 'disk-usage', path: '/dizin', recursive: true, limit: 20 }

// Sembolik link bilgisi
{ type: 'symlink', path: '/link' }
```

### 7. compare - Birleşik Dosya Karşılaştırma

Metin, binary veya özyinelemeli modlarla dosya veya dizin karşılaştırma.

**Parametreler:**
- `type`: `'text'` | `'binary'` | `'directory'` (varsayılan: `'text'`)
- `path1`: string
- `path2`: string
- `ignoreWhitespace`: boolean
- `contextLines`: number (metin için)
- `recursive`: boolean (dizin için)
- `compareContent`: boolean (dizin için)

**Örnekler:**
```typescript
// Metin diff
{ type: 'text', path1: '/eski.txt', path2: '/yeni.txt', contextLines: 3 }

// Binary karşılaştırma
{ type: 'binary', path1: '/a.bin', path2: '/b.bin' }

// Dizin karşılaştırma
{ type: 'directory', path1: '/dizin1', path2: '/dizin2', recursive: true }
```

### 8. utility - Birleşik Yardımcı İşlemler

Tek araçta yedekleme, sıkıştırma, hash ve birleştirme işlemleri.

**Parametreler:**
- `operation`:
  - Yedekleme: `'backup-create'` | `'backup-restore'` | `'backup-list'` | `'backup-rotate'`
  - Sıkıştırma: `'compress'` | `'decompress'`
  - Hash: `'hash'` | `'hash-verify'` | `'hash-batch'` | `'hash-directory'`
  - Birleştirme: `'merge-text'` | `'merge-json'`
- `path`: string
- `paths`: string[] (toplu/birleştirme için)
- `format`: `'gzip'` | `'brotli'` (sıkıştırma için)
- `algorithm`: `'md5'` | `'sha1'` | `'sha256'` | `'sha512'` (hash için)
- `outputPath`: string
- `versioned`: boolean (yedekleme için)
- `keepLast`: number (yedek rotasyonu için)
- `separator`: string (merge-text için)
- `strategy`: `'shallow'` | `'deep'` (merge-json için)

**Örnekler:**
```typescript
// Versiyonlu yedek oluştur
{ operation: 'backup-create', path: '/file.txt', versioned: true }

// Brotli ile sıkıştır
{ operation: 'compress', path: '/buyuk.txt', format: 'brotli' }

// Dosya hash'i
{ operation: 'hash', path: '/file.txt', algorithm: 'sha256' }

// Toplu hash
{ operation: 'hash-batch', paths: ['/a.txt', '/b.txt'], algorithm: 'md5' }

// Metin dosyalarını birleştir
{ operation: 'merge-text', paths: ['/a.txt', '/b.txt'],
  outputPath: '/birlesmis.txt', separator: '\n---\n' }

// JSON birleştir (derin)
{ operation: 'merge-json', paths: ['/a.json', '/b.json'],
  outputPath: '/birlesmis.json', strategy: 'deep' }
```

### 9. git - Birleşik Git İşlemleri

MCP üzerinden git komutları çalıştırma.

**Parametreler:**
- `command`: `'status'` | `'log'` | `'diff'` | `'branch'` | `'show'` | `'blame'`
- `path`: string (repo yolu, varsayılan: '.')
- `short`: boolean (status için)
- `staged`: boolean (diff için)
- `file`: string (belirli dosya)
- `unified`: number (diff için bağlam satırları)
- `limit`: number (log için)
- `oneline`: boolean (log için)
- `graph`: boolean (log için)
- `author`: string (log için)
- `since`: string (log için)
- `remote`: boolean (branch için)
- `all`: boolean (branch için)
- `commit`: string (show için, varsayılan: 'HEAD')
- `stat`: boolean (show için)
- `lineStart`: number (blame için)
- `lineEnd`: number (blame için)

**Örnekler:**
```typescript
// Status (kısa)
{ command: 'status', path: '/repo', short: true }

// Log (son 10, tek satır)
{ command: 'log', limit: 10, oneline: true, graph: true }

// Diff (staged)
{ command: 'diff', staged: true }

// Blame (belirli satırlar)
{ command: 'blame', file: 'src/index.ts', lineStart: 10, lineEnd: 20 }
```

### 10. validate - Birleşik Doğrulama İşlemleri

Kod dosyaları için sözdizimi kontrolü ve linting.

**Parametreler:**
- `type`: `'syntax'` | `'lint'` (varsayılan: `'syntax'`)
- `path`: string
- `language`: `'typescript'` | `'javascript'` | `'json'` | `'auto'` (varsayılan: `'auto'`)
- `strict`: boolean
- `fix`: boolean (lint için)
- `configPath`: string (eslint config)

**Örnekler:**
```typescript
// Sözdizimi kontrolü (otomatik algılama)
{ type: 'syntax', path: '/file.ts' }

// Düzeltmelerle lint
{ type: 'lint', path: '/kod.js', fix: true, configPath: '.eslintrc.json' }

// Sıkı JSON doğrulama
{ type: 'syntax', path: '/veri.json', language: 'json', strict: true }
```

## Performans & Optimizasyon

- **%79 Daha Az Araç**: 48 → 10 birleşik araç, LLM çağrıları için token maliyetini azaltır
- **Tip Güvenliği**: Zod çalışma zamanı doğrulaması ile %100 strict typing
- **Verimli Toplu İşlemler**: Tek çağrıda birden fazla dosya için toplu işlemler
- **Akış**: Akış yetenekleri ile büyük dosya desteği
- **Önbellekleme**: Tekrarlanan işlemler için akıllı önbellekleme

## Claude Desktop ile Kullanım

`claude_desktop_config.json` dosyanıza ekleyin:

### Docker

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=/Users/username/Desktop,dst=/projects/Desktop",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### NPX

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

## VS Code ile Kullanım

Hızlı kurulum için aşağıdaki kurulum butonlarına tıklayın:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-filesystem%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D) [![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=filesystem&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22--mount%22%2C%22type%3Dbind%2Csrc%3D%24%7BworkspaceFolder%7D%2Cdst%3D%2Fprojects%2Fworkspace%22%2C%22mcp%2Ffilesystem%22%2C%22%2Fprojects%22%5D%7D)

Manuel kurulum için workspace'inizdeki `.vscode/mcp.json` dosyasına ekleyin:

### Docker

```json
{
  "servers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--mount", "type=bind,src=${workspaceFolder},dst=/projects/workspace",
        "mcp/filesystem",
        "/projects"
      ]
    }
  }
}
```

### NPX

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "${workspaceFolder}"
      ]
    }
  }
}
```

## Derleme

```bash
# Bağımlılıkları yükle
bun install

# Derle
bun run build

# Docker derlemesi
docker build -t mcp/filesystem -f src/filesystem/Dockerfile .
```

## Geliştirme

```bash
# Testleri çalıştır
bun test

# Tip kontrolü
bun run build

# İzleme modu
bun run dev
```

## Teknik Detaylar

- **Dil**: %100 tip güvenliği ile TypeScript
- **Runtime**: Node.js
- **Validasyon**: Çalışma zamanı kontrolü ile Zod şemaları
- **Protokol**: Model Context Protocol (MCP)
- **Mimari**: Verimlilik için birleşik araç deseni

## Lisans

MIT Lisansı - detaylar için LICENSE dosyasına bakın.
