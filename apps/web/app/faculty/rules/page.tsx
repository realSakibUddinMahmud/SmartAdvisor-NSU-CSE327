'use client';

import React, { useState } from 'react';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { FacultyHeader } from '@/components/FacultyHeader';
import { BypassRule } from '@/types';
import { Info, Plus, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function FacultyRulesPage() {
  const { bypassRules, toggleBypassRule, createBypassRule, lastError, clearError } =
    useSmartAdvisor();

  const [code, setCode] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<BypassRule['category']>('Standing');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFeedback(null);

    if (code.trim().length < 3 || title.trim().length < 3 || description.trim().length < 5) {
      setFormError('Rule code (>=3 chars), title (>=3 chars), and description (>=5 chars) are required.');
      return;
    }

    setSubmitting(true);
    const res = await createBypassRule({
      code: code.trim(),
      title: title.trim(),
      description: description.trim(),
      category,
      enabled
    });
    setSubmitting(false);

    if (!res.ok || !res.data) {
      setFormError(res.message || 'Failed to create bypass rule.');
      return;
    }

    const autoCount = res.data.autoApprovedCount ?? 0;
    setFeedback(
      `Created ${res.data.rule.code} (${res.data.rule.title}). Auto-approved ${autoCount} matching petition(s).`
    );
    setCode('');
    setTitle('');
    setDescription('');
  };

  const handleToggleRule = async (ruleId: string) => {
    setFormError(null);
    setFeedback(null);
    const res = await toggleBypassRule(ruleId);
    if (!res.ok) {
      setFormError(res.message || 'Failed to toggle rule.');
      return;
    }
    const autoCount = res.data?.autoApprovedCount ?? 0;
    if (autoCount > 0) {
      setFeedback(`Rule updated. Auto-approved ${autoCount} matching pending petition(s).`);
    }
  };

  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-slate-50 flex flex-col">
      <FacultyHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Automated Bypass Rules &amp; Standing Exceptions Engine
          </h1>
          <p className="text-xs text-slate-500">
            Configure automated DAG routing policies enacted by the NSU Academic Senate
          </p>
        </div>

        {/* Informational Banner */}
        <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-900 flex items-start gap-3">
          <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">Autonomous Exception Governance</div>
            <p className="text-indigo-800 text-[11px] leading-relaxed">
              When enabled, these academic policies allow the SmartAdvisor DAG engine to automatically validate and
              grant waivers for eligible senior students and auto-approve matching pending petitions.
            </p>
          </div>
        </div>

        {(feedback || formError || lastError) && (
          <div
            role={formError || lastError ? 'alert' : 'status'}
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              formError || lastError
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {formError || lastError ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>{formError || lastError || feedback}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setFeedback(null);
                clearError();
              }}
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create Bypass Rule Form */}
        <form
          onSubmit={handleCreateRule}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4 text-xs"
        >
          <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-nsu-teal" />
            Create Senate Bypass Rule
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="rule-code" className="block font-semibold text-slate-700 mb-1">
                Rule Code
              </label>
              <input
                id="rule-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. RULE-9.1"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>
            <div>
              <label htmlFor="rule-title" className="block font-semibold text-slate-700 mb-1">
                Policy Title
              </label>
              <input
                id="rule-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Graduating Senior Priority Waiver"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>
            <div>
              <label htmlFor="rule-category" className="block font-semibold text-slate-700 mb-1">
                Category
              </label>
              <select
                id="rule-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as BypassRule['category'])}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
              >
                <option value="Standing">Standing</option>
                <option value="Prerequisite">Prerequisite</option>
                <option value="Exam Load">Exam Load</option>
                <option value="Capacity">Capacity</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="rule-description" className="block font-semibold text-slate-700 mb-1">
              Policy Description
            </label>
            <textarea
              id="rule-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the eligibility criteria and scope of this bypass rule..."
              required
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded text-nsu-teal"
              />
              Enable immediately (auto-approves matching pending petitions)
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-nsu-teal hover:bg-teal-700 disabled:opacity-60 text-white font-bold flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{submitting ? 'Creating Rule...' : 'Create Bypass Rule'}</span>
            </button>
          </div>
        </form>

        {/* Rules Table */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <th className="py-3.5 px-4 w-32">Rule Code</th>
                  <th className="py-3.5 px-4">Policy Title &amp; Description</th>
                  <th className="py-3.5 px-4 w-32">Category</th>
                  <th className="py-3.5 px-4">Authority Directives</th>
                  <th className="py-3.5 px-4 text-right w-36">Policy State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {bypassRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 font-mono font-bold text-indigo-700">
                      {rule.code}
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-900 text-xs">{rule.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {rule.description}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {rule.category}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-[11px] text-slate-500 font-mono">
                      {rule.lastUpdated}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleRule(rule.id)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer ${
                          rule.enabled
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300 border border-slate-300'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            rule.enabled ? 'bg-emerald-600' : 'bg-slate-400'
                          }`}
                        ></span>
                        <span>{rule.enabled ? 'Enabled' : 'Suspended'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
