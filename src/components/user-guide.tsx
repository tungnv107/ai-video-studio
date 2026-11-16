'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Clapperboard, LifeBuoy, Moon, Search, Sun, X } from 'lucide-react';
import { guideSections, troubleshooting } from '@/content/user-guide';
import './user-guide.css';

const searchable = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export default function UserGuide() {
  const [query, setQuery] = useState('');
  const [dark, setDark] = useState(true);
  const [active, setActive] = useState('bat-dau');

  useEffect(() => {
    try { setDark(localStorage.getItem('studio-theme') !== 'light'); } catch { /* Theme preference is optional. */ }
    const syncHash = () => setActive(location.hash.slice(1) || 'bat-dau');
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem('studio-theme', next ? 'dark' : 'light'); } catch { /* Reading the guide does not require storage. */ }
  }

  const words = searchable(query.trim()).split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every(word => searchable(text).includes(word));
  const sections = guideSections.filter(section => matches([section.title, section.summary, ...section.steps.flatMap(step => [step.title, step.text]), ...(section.notes || [])].join(' ')));
  const questions = troubleshooting.filter(item => matches(item.question + ' ' + item.answer));

  return <div className="guide-page">
    <a className="guide-skip" href="#noi-dung">Chuyển đến nội dung hướng dẫn</a>
    <header className="guide-header">
      <a className="brand" href="/" aria-label="Video Studio"><span className="brand-icon"><Clapperboard size={23} /></span><span>video<span className="brand-light">studio</span><small>AI AUTOMATION</small></span></a>
      <div className="guide-header-actions"><button className="icon-button" aria-label="Đổi giao diện" onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button><a className="button" href="/"><ArrowLeft size={15} />Vào studio</a></div>
    </header>

    <main className="guide-main" id="noi-dung">
      <section className="guide-hero" aria-labelledby="guide-title">
        <div><span className="eyebrow"><BookOpen size={15} /> TRUNG TÂM HƯỚNG DẪN</span><h1 id="guide-title">Từ ý tưởng đầu tiên<br /><em>đến video sẵn sàng chia sẻ.</em></h1><p>Mọi bước sử dụng Video Studio, từ thiết lập kênh đến kiểm tra thành phẩm. Chọn điều bạn cần làm và bắt đầu.</p><div className="guide-hero-actions"><a className="button primary" href="#bat-dau" onClick={() => setQuery('')}>Tạo video đầu tiên <ArrowRight size={16} /></a><a className="text-button" href="#xu-ly-su-co" onClick={() => setQuery('')}><LifeBuoy size={16} />Tôi đang gặp lỗi</a></div></div>
        <ol className="guide-workflow" aria-label="Quy trình sản xuất"><li><span>01</span><div><b>Thiết lập</b><small>Kênh · Provider · Ngân sách</small></div><Check size={17} /></li><li><span>02</span><div><b>Sáng tạo</b><small>Ý tưởng · Kịch bản · Dựng phim</small></div><Check size={17} /></li><li><span>03</span><div><b>Kiểm tra & chia sẻ</b><small>Preview · Phê duyệt · Xuất bản</small></div><ArrowRight size={17} aria-hidden="true" /></li></ol>
      </section>

      <div className="guide-search-bar"><div className="search"><Search size={19} /><input type="search" aria-label="Tìm trong hướng dẫn" placeholder="Tìm hướng dẫn: phụ đề, ngân sách, lịch, TikTok…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X size={16} /></button>}</div><p role="status">{query ? `${sections.length} chủ đề · ${questions.length} câu hỏi phù hợp` : '10 chủ đề · Hướng dẫn theo giao diện thực tế'}</p></div>

      <div className="guide-layout">
        <aside className="guide-sidebar"><nav aria-label="Mục lục hướng dẫn"><p className="eyebrow">TRONG HƯỚNG DẪN NÀY</p>{guideSections.map((section, index) => <a key={section.id} href={'#' + section.id} aria-current={active === section.id ? 'location' : undefined} onClick={() => { setQuery(''); setActive(section.id); }}><span>{String(index + 1).padStart(2, '0')}</span>{section.title}</a>)}<a href="#xu-ly-su-co" aria-current={active === 'xu-ly-su-co' ? 'location' : undefined} onClick={() => { setQuery(''); setActive('xu-ly-su-co'); }}><LifeBuoy size={16} />Xử lý sự cố</a></nav><div className="guide-side-note"><BookOpen size={20} /><b>Đọc trước, thực hành sau</b><p>Hướng dẫn không cần đăng nhập. Các liên kết đến studio yêu cầu tài khoản của bạn.</p></div></aside>
        <div className="guide-articles">
          {!sections.length && !questions.length && <section className="panel guide-no-results"><Search size={28} /><h2>Không tìm thấy nội dung phù hợp</h2><p>Thử từ khóa ngắn hơn như “phụ đề”, “API key” hoặc “lịch”. Bạn có thể tìm có dấu hoặc không dấu.</p><button className="button" onClick={() => setQuery('')}>Xem toàn bộ hướng dẫn</button></section>}
          {sections.map(section => <article className="panel guide-article" id={section.id} key={section.id} aria-labelledby={section.id + '-title'}><header><span className="guide-section-number">{String(guideSections.indexOf(section) + 1).padStart(2, '0')}</span><div><h2 id={section.id + '-title'}><a href={'#' + section.id}>{section.title}</a></h2><p>{section.summary}</p></div></header><ol className="guide-steps">{section.steps.map(step => <li key={step.title}><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>{section.notes?.map(note => <p className="guide-note" key={note}><BookOpen size={17} /><span>{note}</span></p>)}<footer className="guide-section-links">{section.links.map(link => <a key={link.href} href={link.href}>{link.label}<ChevronRight size={14} /></a>)}</footer></article>)}
          {!!questions.length && <section className="panel guide-article guide-faq" id="xu-ly-su-co" aria-labelledby="faq-title"><header><span className="guide-section-number"><LifeBuoy size={22} /></span><div><h2 id="faq-title">Xử lý sự cố thường gặp</h2><p>Kiểm tra nguyên nhân và bước tiếp theo trước khi chạy lại công việc.</p></div></header>{questions.map(item => <details key={item.question} open={query.trim() ? true : undefined}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>}
          <aside className="guide-limits"><h2>Những gì cần cấu hình thêm</h2><p>Sản xuất AI cần key, quyền model và ngân sách của bạn. Đăng mạng xã hội cần ứng dụng OAuth, quyền tài khoản và cấu hình máy chủ. Email reset cần SMTP. Nếu tính năng chưa sẵn sàng, xem thông báo trong studio hoặc nhờ người vận hành kiểm tra cấu hình.</p><p>Studio hỗ trợ biên tập theo scene; đây không phải trình dựng nhiều track tự do. Luôn xem thành phẩm và kiểm tra dữ kiện, nguồn, quyền sử dụng trước khi chia sẻ.</p></aside>
        </div>
      </div>
    </main>
    <footer className="guide-footer"><span>AI Video Automation Studio · Hướng dẫn sử dụng</span><a href="#noi-dung">Về đầu trang ↑</a></footer>
  </div>;
}
