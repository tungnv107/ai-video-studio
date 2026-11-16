import type { Metadata } from 'next';
import UserGuide from '@/components/user-guide';

export const metadata: Metadata = {
  title: 'Hướng dẫn sử dụng · AI Video Studio',
  description: 'Hướng dẫn tạo kênh, viết kịch bản, dựng video AI, quản lý lịch, phê duyệt và xuất bản trong Video Studio.',
};

export default function GuidePage() {
  return <UserGuide />;
}
