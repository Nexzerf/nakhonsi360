import Link from 'next/link';
import { SOURCES } from '@/lib/registry/sources';
import { CURRENT_PHASE } from '@/lib/registry/layers';

export const metadata = { title: 'เกี่ยวกับข้อมูล — Nakhonsi360' };

/** Every source, licence and attribution, as plain HTML. */
export default function AboutDataPage() {
  const phases = [1, 2, 3, 4] as const;
  return (
    <main className="mx-auto max-w-3xl bg-surface px-4 py-6 text-fg">
      <Link href="/" className="inline-flex min-h-11 items-center text-accent underline">
        ← กลับสู่แผนที่ / Back to map
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">เกี่ยวกับข้อมูล / About the data</h1>
      <p className="mt-2 text-fg-muted">
        Nakhonsi360 รวบรวมข้อมูลจากหน่วยงานรัฐและแหล่งข้อมูลเปิด ทุกค่าที่แสดงบนแผนที่ระบุแหล่งที่มาและเวลาของข้อมูล ไม่มีการสร้างข้อมูลขึ้นเอง และไม่ใช้ AI
        สร้างเนื้อหา — Every value on the map carries its source and time. No data is invented and no AI is used.
      </p>
      <p className="mt-2 text-sm text-fg-subtle">ระยะการพัฒนาปัจจุบัน / Current build phase: {CURRENT_PHASE}</p>
      {phases.map((p) => (
        <section key={p} className="mt-6">
          <h2 className="text-lg font-semibold">
            ระยะที่ {p} / Phase {p}
            {p > CURRENT_PHASE ? ' — ยังไม่เชื่อมต่อ / not connected yet' : ''}
          </h2>
          <ul className="mt-2 space-y-4">
            {SOURCES.filter((s) => s.phase === p).map((s) => (
              <li key={s.id} className="rounded border border-line p-3">
                <h3 className="font-medium">{s.organization}</h3>
                <p className="text-sm text-fg-muted">{s.organizationEn}</p>
                <p className="mt-1 text-sm">
                  {s.datasetName} <span className="text-fg-subtle">/ {s.datasetNameEn}</span>
                </p>
                <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                  <dt className="text-fg-subtle">Licence</dt>
                  <dd>{s.license}</dd>
                  <dt className="text-fg-subtle">Attribution</dt>
                  <dd>{s.attribution}</dd>
                  <dt className="text-fg-subtle">Endpoint</dt>
                  <dd className="break-all">{s.endpoint}</dd>
                  <dt className="text-fg-subtle">API key</dt>
                  <dd>{s.requiresKey ? 'ต้องใช้ (ฝั่งเซิร์ฟเวอร์) / required (server-side)' : 'ไม่ต้องใช้ / not required'}</dd>
                  <dt className="text-fg-subtle">Verification</dt>
                  <dd>{s.verified ? `ตรวจสอบแล้ว ${s.verifiedAt}` : s.verificationNote}</dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
