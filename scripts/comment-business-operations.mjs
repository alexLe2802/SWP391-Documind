import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'backend/src');

const entities = {
  auditLog: 'nhật ký kiểm toán',
  category: 'danh mục',
  chatMessage: 'tin nhắn chat',
  chatSession: 'phiên chat',
  document: 'tài liệu',
  documentChunk: 'đoạn nội dung tài liệu',
  documentContent: 'nội dung trích xuất',
  downloadLog: 'lịch sử tải xuống',
  entitlementTransaction: 'sổ cái quyền lợi',
  paymentOrder: 'hóa đơn thanh toán',
  role: 'vai trò',
  subject: 'môn học',
  subscription: 'ví tài nguyên',
  tag: 'thẻ',
  user: 'người dùng',
  userSubscription: 'quyền lợi người dùng',
};

const actions = {
  create: 'Tạo',
  delete: 'Xóa',
  deleteMany: 'Xóa các',
  update: 'Cập nhật',
  updateMany: 'Cập nhật các',
  upsert: 'Tạo mới hoặc cập nhật',
};

// Thu thập các file service/controller vận hành có thao tác gây thay đổi dữ liệu.
function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' ? [] : collectFiles(target);
    }
    return entry.name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(entry.name)
      ? [target]
      : [];
  });
}

// Kiểm tra dòng gần nhất đã có comment giải thích cho thao tác hay chưa.
function hasCommentAbove(lines, index) {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const text = lines[cursor].trim();
    if (!text) continue;
    return text.startsWith('//') || text.startsWith('/*') || text.startsWith('*');
  }
  return false;
}

// Tạo câu giải thích ngắn cho một thao tác ghi database.
function databaseComment(entity, action) {
  const objectName = entities[entity] ?? `bản ghi ${entity}`;
  return `${actions[action]} ${objectName} trong database.`;
}

// Chèn comment trước transaction, thao tác database và thao tác lưu trữ quan trọng.
function commentFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const output = [];
  let inserted = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const indent = line.match(/^\s*/)?.[0] ?? '';
    let description;
    const mutation = line.match(
      /(?:this\.prisma|transaction)\.([A-Za-z][A-Za-z0-9]*)\.(create|update|updateMany|upsert|delete|deleteMany)\(/,
    );
    if (mutation) {
      description = databaseComment(mutation[1], mutation[2]);
    } else if (/\.\$transaction\s*\(/.test(line)) {
      description = 'Thực hiện các thay đổi liên quan trong cùng một database transaction.';
    } else if (/storage\.(?:uploadObject|putObject)\s*\(/.test(line)) {
      description = 'Tải tệp lên kho lưu trữ Cloudflare R2.';
    } else if (/storage\.(?:deleteObject|removeObject)\s*\(/.test(line)) {
      description = 'Xóa object tương ứng khỏi kho lưu trữ Cloudflare R2.';
    } else if (/storage\.createObject(?:Preview|Download)Url\s*\(/.test(line)) {
      description = 'Tạo URL tạm thời để truy cập object an toàn từ Cloudflare R2.';
    }

    if (description && !hasCommentAbove(lines, index)) {
      output.push(`${indent}// ${description}`);
      inserted++;
    }
    output.push(line);
  }

  if (inserted) fs.writeFileSync(file, output.join('\n'));
  return inserted;
}

let total = 0;
for (const file of collectFiles(sourceRoot)) total += commentFile(file);
process.stdout.write(`Added ${total} business-operation comments.\n`);
