"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Employee = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  active: boolean;
};

export default function EmployeesAdminPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 추가 폼
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/employees");
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const data = await res.json();
    setEmployees(data.employees ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(ok: boolean, text: string) {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, department }),
    });
    const data = await res.json();
    if (res.ok) {
      flash(true, `${name} 님을 추가했습니다.`);
      setCode("");
      setName("");
      setDepartment("");
      load();
    } else {
      flash(false, data.error ?? "추가에 실패했습니다.");
    }
  }

  async function toggleActive(emp: Employee) {
    const res = await fetch(`/api/admin/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !emp.active }),
    });
    const data = await res.json();
    flash(res.ok, res.ok ? "변경했습니다." : data.error);
    if (res.ok) load();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">직원 관리</h1>
        <Link
          href="/admin"
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          ← 대시보드
        </Link>
      </div>

      {/* 직원 추가 */}
      <form
        onSubmit={addEmployee}
        className="mb-6 rounded-xl border border-slate-200 bg-white p-4"
      >
        <div className="mb-3 text-sm font-medium text-slate-600">직원 추가</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="사번"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="부서(선택)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          추가
        </button>
      </form>

      {msg && (
        <div
          className={`mb-4 rounded-lg px-4 py-2 text-sm ${
            msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 직원 목록 */}
      {loading ? (
        <div className="py-16 text-center text-slate-400">불러오는 중…</div>
      ) : employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400">
          등록된 직원이 없습니다. 위에서 추가하세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">사번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">부서</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id} className={e.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-mono text-slate-600">{e.code}</td>
                  <td className="px-4 py-3">{e.name}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.department ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    {e.active ? (
                      <span className="text-slate-700">활성</span>
                    ) : (
                      <span className="text-slate-400">비활성</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-xs">
                      <button
                        onClick={() => toggleActive(e)}
                        className="text-slate-500 hover:underline"
                      >
                        {e.active ? "비활성화" : "활성화"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
