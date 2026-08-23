import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const requireFromBackend = createRequire(path.join(root, 'backend/package.json'));
const ts = requireFromBackend('typescript');

const roots = [
  path.join(root, 'backend/src'),
  path.join(root, 'frontend/src'),
  path.join(root, 'mobile/lib'),
];

// Thu thập đệ quy các file mã nguồn vận hành cần bổ sung comment.
function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' ? [] : collectFiles(target);
    }
    if (!/\.(ts|tsx|dart)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(ts|tsx)$/.test(entry.name)) return [];
    return [target];
  });
}

// Chuyển tên camelCase/PascalCase thành cụm từ dễ đọc trong comment.
function readableName(name) {
  const words = name
    .replace(/^_+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  const translations = {
    all: 'danh sách', one: 'chi tiết', current: 'hiện tại', subscription: 'quyền lợi',
    subscriptions: 'quyền lợi', payment: 'thanh toán', payments: 'thanh toán', plan: 'gói dịch vụ',
    plans: 'gói dịch vụ', document: 'tài liệu', documents: 'tài liệu', user: 'người dùng',
    users: 'người dùng', upload: 'tải lên', download: 'tải xuống', preview: 'xem trước',
    status: 'trạng thái', visibility: 'quyền hiển thị', auth: 'xác thực', login: 'đăng nhập',
    logout: 'đăng xuất', register: 'đăng ký', profile: 'hồ sơ', community: 'cộng đồng',
    saved: 'đã lưu', notification: 'thông báo', notifications: 'thông báo', category: 'danh mục',
    categories: 'danh mục', subject: 'môn học', subjects: 'môn học', tag: 'thẻ', tags: 'thẻ',
    content: 'nội dung', source: 'nguồn', sources: 'nguồn', session: 'phiên', sessions: 'phiên',
    message: 'tin nhắn', messages: 'tin nhắn', response: 'phản hồi', request: 'yêu cầu', error: 'lỗi',
    history: 'lịch sử', checkout: 'đơn thanh toán', data: 'dữ liệu', file: 'tệp', files: 'tệp',
  };
  return words
    .split(/\s+/)
    .map((word) => translations[word] ?? word)
    .join(' ');
}

// Tạo mô tả ngắn dựa trên quy ước đặt tên phổ biến của function.
function describe(name, options = {}) {
  const readable = readableName(name) || 'tác vụ tương ứng';
  if (options.isConstructor) return 'Khởi tạo đối tượng và nhận các dependency cần thiết.';
  if (name === 'build') return 'Xây dựng giao diện hoặc dữ liệu trả về.';
  if (name === 'createState') return 'Tạo state quản lý vòng đời của widget.';
  if (name === 'initState') return 'Khởi tạo state và tài nguyên ban đầu.';
  if (name === 'dispose') return 'Giải phóng tài nguyên khi đối tượng bị hủy.';
  if (/^(findAll|listAll|getAll|fetchAll|loadAll)$/i.test(name)) return 'Lấy danh sách dữ liệu phù hợp.';
  if (/^(findOne|getOne|fetchOne)$/i.test(name)) return 'Lấy một bản ghi dữ liệu phù hợp.';
  if (/^[A-Z]/.test(name)) return `Hiển thị giao diện ${readable}.`;
  if (/^(handle|on)/i.test(name)) return `Xử lý sự kiện ${readable.replace(/^(handle|on)\s+/, '')}.`;
  if (/^(get|fetch|find|load|list|read|watch)/i.test(name)) return `Lấy dữ liệu ${readable.replace(/^(get|fetch|find|load|list|read|watch)\s+/, '')}.`;
  if (/^(create|add|insert|upload|register|save)/i.test(name)) return `Tạo hoặc lưu ${readable.replace(/^(create|add|insert|upload|register|save)\s+/, '')}.`;
  if (/^(update|set|change|toggle|sync|refresh|reset)/i.test(name)) return `Cập nhật ${readable.replace(/^(update|set|change|toggle|sync|refresh|reset)\s+/, '')}.`;
  if (/^(delete|remove|clear|cancel|close|dispose|revoke)/i.test(name)) return `Xóa hoặc giải phóng ${readable.replace(/^(delete|remove|clear|cancel|close|dispose|revoke)\s+/, '')}.`;
  if (/^(is|has|can|should|validate|verify|check|ensure|matches|supports)/i.test(name)) return `Kiểm tra điều kiện ${readable.replace(/^(is|has|can|should|validate|verify|check|ensure|matches|supports)\s+/, '')}.`;
  if (/^(format|serialize|deserialize|parse|normalize|map|convert|transform|to|from|build|resolve)/i.test(name)) return `Chuyển đổi hoặc chuẩn hóa ${readable.replace(/^(format|serialize|deserialize|parse|normalize|map|convert|transform|to|from|build|resolve)\s+/, '')}.`;
  if (/^(render|show|open|navigate)/i.test(name)) return `Hiển thị hoặc mở ${readable.replace(/^(render|show|open|navigate)\s+/, '')}.`;
  if (/^(send|notify|publish|approve|reject|moderate)/i.test(name)) return `Thực hiện nghiệp vụ ${readable}.`;
  if (/^(process|run|execute|retry|extract|scan|calculate|compute|generate)/i.test(name)) return `Xử lý ${readable.replace(/^(process|run|execute|retry|extract|scan|calculate|compute|generate)\s+/, '')}.`;
  return `Thực hiện chức năng ${readable}.`;
}

// Kiểm tra khai báo đã có comment giải thích ngay phía trên hay chưa.
function hasLeadingDoc(source, position) {
  const before = source.slice(0, position).replace(/[ \t]+$/g, '');
  return /(?:\/\*\*[\s\S]*?\*\/|\/\/\/?[^\n]*)\s*$/.test(before);
}

// Tìm đầu dòng và độ thụt lề để chèn comment không làm đổi định dạng code.
function insertionAtLine(source, position) {
  const lineStart = source.lastIndexOf('\n', position - 1) + 1;
  const indent = source.slice(lineStart, position).match(/^\s*/)?.[0] ?? '';
  return { position: lineStart, indent };
}

// Bổ sung comment cho function, method và arrow function được đặt tên trong TS/TSX.
function commentTypeScript(file) {
  const source = removeGeneratedComments(fs.readFileSync(file, 'utf8'));
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const insertions = new Map();

  // Ghi nhận vị trí cần thêm comment nếu khai báo chưa được giải thích.
  function add(node, name, options) {
    if (!name || node.jsDoc?.length) return;
    const start = node.getStart(sourceFile);
    const target = insertionAtLine(source, start);
    if (hasLeadingDoc(source, target.position)) return;
    insertions.set(target.position, `${target.indent}// ${describe(name, options)}\n`);
  }

  // Duyệt cây cú pháp và chọn các function có tên cần tạo comment.
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.body && node.name) {
      add(node, node.name.text);
    } else if (
      (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) &&
      node.body &&
      ts.isIdentifier(node.name)
    ) {
      add(node, node.name.text);
    } else if (ts.isConstructorDeclaration(node) && node.body) {
      add(node, 'constructor', { isConstructor: true });
    } else if (ts.isVariableStatement(node)) {
      const declaration = node.declarationList.declarations.length === 1
        ? node.declarationList.declarations[0]
        : undefined;
      if (
        declaration &&
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ) {
        add(node, declaration.name.text);
      }
    } else if (
      ts.isPropertyDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      add(node, node.name.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  let output = source;
  for (const [position, comment] of [...insertions.entries()].sort((a, b) => b[0] - a[0])) {
    output = output.slice(0, position) + comment + output.slice(position);
  }
  if (output !== source) fs.writeFileSync(file, output);
  return insertions.size;
}

// Bổ sung comment cho các method/function có khai báo rõ ràng trong Dart.
function commentDart(file) {
  const source = removeGeneratedComments(fs.readFileSync(file, 'utf8'));
  const lines = source.split('\n');
  const output = [];
  let count = 0;
  const declaration = /^(\s*)(?:(?:static|external|abstract)\s+)*(?:Future(?:<[^>]+>)?|Stream(?:<[^>]+>)?|Widget|void|bool|String|int|double|num|dynamic|Map(?:<[^>]+>)?|List(?:<[^>]+>)?|Set(?:<[^>]+>)?|State(?:<[^>]+>)?|ConsumerState(?:<[^>]+>)?|[A-Z][\w<>?, ]*)\s+(_?[A-Za-z]\w*)\s*\(/;

  for (const line of lines) {
    const match = line.match(declaration);
    const name = match?.[2];
    const previous = output.at(-1)?.trim() ?? '';
    if (name && !previous.startsWith('//') && !previous.startsWith('// ignore')) {
      let annotationIndex = output.length;
      while (annotationIndex > 0 && output[annotationIndex - 1].trim().startsWith('@')) annotationIndex--;
      const beforeAnnotation = output[annotationIndex - 1]?.trim() ?? '';
      if (!beforeAnnotation.startsWith('//')) {
        output.splice(annotationIndex, 0, `${match[1]}// ${describe(name)}`);
        count++;
      }
    }
    output.push(line);
  }
  const result = output.join('\n');
  if (result !== source) fs.writeFileSync(file, result);
  return count;
}

// Xóa riêng comment do codemod sinh để có thể tạo lại khi quy tắc thay đổi.
function removeGeneratedComments(source) {
  const generatedDescription = '(?:Khởi tạo đối tượng và nhận các dependency cần thiết|Xây dựng giao diện hoặc dữ liệu trả về|Tạo state quản lý vòng đời của widget|Khởi tạo state và tài nguyên ban đầu|Giải phóng tài nguyên khi đối tượng bị hủy|Lấy danh sách dữ liệu phù hợp|Lấy một bản ghi dữ liệu phù hợp|Hiển thị giao diện [^\\n]+|Xử lý sự kiện [^\\n]+|Lấy dữ liệu [^\\n]+|Tạo hoặc lưu [^\\n]+|Cập nhật [^\\n]+|Xóa hoặc giải phóng [^\\n]+|Kiểm tra điều kiện [^\\n]+|Chuyển đổi hoặc chuẩn hóa [^\\n]+|Hiển thị hoặc mở [^\\n]+|Thực hiện nghiệp vụ [^\\n]+|Xử lý [^\\n]+|Thực hiện chức năng [^\\n]+)\\.';
  return source
    .replace(new RegExp(`^[ \\t]*\\/\\*\\* ${generatedDescription} \\*\\/\\r?\\n`, 'gm'), '')
    .replace(new RegExp(`^[ \\t]*\\/\\/\\/? ${generatedDescription}\\r?\\n`, 'gm'), '');
}

let total = 0;
for (const file of roots.flatMap(collectFiles)) {
  total += file.endsWith('.dart') ? commentDart(file) : commentTypeScript(file);
}
process.stdout.write(`Added ${total} production function comments.\n`);
