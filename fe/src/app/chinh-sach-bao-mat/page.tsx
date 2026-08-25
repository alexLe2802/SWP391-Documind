import Link from "next/link";
import { ROUTES } from "../../lib/routes";

// Hiển thị giao diện privacy page.
export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article>
        <p className="eyebrow">DOCUMIND</p>
        <h1>Chính sách bảo mật</h1>
        <p>
          DocuMind sử dụng thông tin tài khoản để xác thực, phân quyền và cung
          cấp không gian học tập cá nhân. Mật khẩu được Firebase Authentication
          quản lý và không được lưu trong database của DocuMind.
        </p>
        <p>
          Tài liệu riêng tư chỉ được xử lý để cung cấp các tính năng mà bạn yêu
          cầu và không tự động xuất hiện trong khu vực cộng đồng.
        </p>
        <Link href={ROUTES.register}>Quay lại đăng ký</Link>
      </article>
    </main>
  );
}
