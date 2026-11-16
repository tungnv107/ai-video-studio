import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'AI Video Studio · Sáng tạo ở quy mô mới',description:'Không gian sản xuất video AI, quản lý nội dung và lịch xuất bản.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){
  // Extensions can add body attributes before hydration (e.g. cz-shortcut-listen).
  // Limit the escape hatch to this element; React still checks the app below it.
  return <html lang="vi"><body suppressHydrationWarning>{children}</body></html>;
}
