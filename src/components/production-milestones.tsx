'use client';
type Project={scheduledAt?:string|null;productionAt?:string|null;deadlineAt?:string|null;publishAt?:string|null;researchStartedAt?:string|null;researchCompletedAt?:string|null;productionStartedAt?:string|null;completedAt?:string|null;deadlineMissedAt?:string|null;publishingJobs?:{id:string;account:{displayName:string;platform:string};post?:{publishedAt:string;url:string}|null}[]};
const time=(value?:string|null)=>value?new Date(value).toLocaleString('vi-VN'):'Chưa có';
export default function ProductionMilestones({project}:{project:Project}){
 if(!project.scheduledAt&&!project.researchStartedAt)return null;
 return <section className="panel"><h3>Tiến độ theo mốc thời gian</h3><p className="muted">Giờ hiển thị theo múi giờ trên máy của bạn. Giờ đăng dự kiến cần video đạt QA và được duyệt.</p><div className="table-wrap"><table><thead><tr><th>Mốc</th><th>Kế hoạch</th><th>Thực tế</th></tr></thead><tbody>
 <tr><td>Bắt đầu nghiên cứu</td><td>{time(project.scheduledAt)}</td><td>{time(project.researchStartedAt)}</td></tr>
 <tr><td>Bắt đầu sản xuất</td><td>{time(project.productionAt)}</td><td>{time(project.productionStartedAt)}</td></tr>
 <tr><td>Hoàn tất video / kịch bản</td><td>{time(project.deadlineAt)}</td><td>{time(project.completedAt)}</td></tr>
 <tr><td>Đăng lên nền tảng</td><td>{time(project.publishAt)}</td><td>{project.publishingJobs?.some(j=>j.post)?project.publishingJobs.filter(j=>j.post).map(j=><div key={j.id}><a href={j.post!.url} target="_blank" rel="noopener noreferrer">{j.account.displayName} · {j.account.platform}</a><small>{time(j.post!.publishedAt)}</small></div>):'Chưa đăng'}</td></tr>
 </tbody></table></div>{project.deadlineMissedAt&&<p className="error-text">Đã trễ deadline chuẩn bị. Kiểm tra giờ đăng và phê duyệt trước khi xuất bản.</p>}{project.researchCompletedAt&&!project.productionStartedAt&&<p className="note">Nghiên cứu đã hoàn tất. Công việc đang chờ đến giờ bắt đầu sản xuất.</p>}</section>;
}
