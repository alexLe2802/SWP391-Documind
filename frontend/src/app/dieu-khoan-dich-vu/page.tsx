import Link from "next/link";
import { ROUTES } from "../../lib/routes";

// Hiển thị giao diện terms page.
export default function TermsPage() {
  return (
    <main className="legal-page">
      <article>
        <p className="eyebrow">DOCUMIND</p>
        <h1>Điều khoản dịch vụ</h1>
        <p>
          Khi tạo tài khoản, bạn đồng ý sử dụng DocuMind đúng mục đích học tập,
          không tải lên nội dung vi phạm pháp luật hoặc quyền sở hữu trí tuệ.
        </p>
        <p>
          Bạn chịu trách nhiệm bảo vệ thông tin đăng nhập và kiểm chứng các câu
          trả lời do AI cung cấp dựa trên nguồn tài liệu gốc.
        </p>
        <Link href={ROUTES.register}>Quay lại đăng ký</Link>
      </article>
    </main>
  );
}
