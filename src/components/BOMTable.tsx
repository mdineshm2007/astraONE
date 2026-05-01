import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Download, X, FileText } from 'lucide-react';
import { ref, onValue, push, remove, set } from 'firebase/database';
import { rtdb } from '../firebase';

interface BOMRow {
  id: string;
  sno?: string;
  category?: string;
  partName: string;
  vendor?: string;
  type: 'Purchased' | 'Fabricated';
  totalMaterialCost: number;
  remarks: string;
  date?: string;
}

// Local editable state for a single row — avoids re-render on every keystroke
function EditableRow({
  row,
  index,
  teamName,
  onSave,
  onDelete,
}: {
  row: BOMRow;
  index: number;
  teamName: string;
  onSave: (id: string, updated: Omit<BOMRow, 'id'>) => void;
  onDelete: (id: string) => void;
}) {
  const [local, setLocal] = useState<Omit<BOMRow, 'id'>>({
    sno: row.sno !== undefined ? row.sno : String(index + 1),
    category: row.category !== undefined ? row.category : teamName,
    partName: row.partName,
    type: row.type,
    totalMaterialCost: row.totalMaterialCost,
    remarks: row.remarks,
    date: row.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }),
  });

  // Sync if Firebase pushes a remote change (e.g. another user edits)
  useEffect(() => {
    setLocal({
      sno: row.sno !== undefined ? row.sno : String(index + 1),
      category: row.category !== undefined ? row.category : teamName,
      partName: row.partName,
      vendor: row.vendor || '',
      type: row.type,
      totalMaterialCost: row.totalMaterialCost,
      remarks: row.remarks,
      date: row.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    });
  }, [row.id, index, teamName]); // Only re-sync when the row ID changes (not on every value change)

  const handleBlur = () => {
    onSave(row.id, local);
  };

  // For dropdown, save immediately since there's no "typing"
  const handleTypeChange = (value: 'Purchased' | 'Fabricated') => {
    const updated = { ...local, type: value };
    setLocal(updated);
    onSave(row.id, updated);
  };

  return (
    <motion.tr
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="group hover:bg-white/[0.03] transition-colors"
    >
      {/* S.No */}
      <td className="px-4 py-2 text-center">
        <input
          type="text"
          value={local.sno}
          onChange={e => setLocal(prev => ({ ...prev, sno: e.target.value }))}
          onBlur={handleBlur}
          className="w-12 bg-transparent border-b border-white/20 focus:border-primary outline-none text-center text-xs text-slate-400 font-bold py-1 transition-colors caret-primary"
        />
      </td>
      
      {/* Category */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={local.category}
          onChange={e => setLocal(prev => ({ ...prev, category: e.target.value }))}
          onBlur={handleBlur}
          className="w-full bg-transparent border-b border-white/20 focus:border-primary outline-none text-[10px] font-black text-primary uppercase tracking-wider py-1 transition-colors caret-primary"
        />
      </td>

      {/* Date (Automated) */}
      <td className="px-4 py-2 text-center">
        <span className="text-[10px] font-bold text-slate-500 uppercase">
          {local.date}
        </span>
      </td>

      {/* Part Name */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={local.partName}
          onChange={e => setLocal(prev => ({ ...prev, partName: e.target.value }))}
          onBlur={handleBlur}
          placeholder="Part name..."
          className="w-full bg-transparent border-b border-white/20 focus:border-primary outline-none text-sm text-white py-1 transition-colors placeholder:text-slate-600 caret-primary"
        />
      </td>

      {/* Vendor */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={local.vendor}
          onChange={e => setLocal(prev => ({ ...prev, vendor: e.target.value }))}
          onBlur={handleBlur}
          placeholder="Vendor..."
          className="w-full bg-transparent border-b border-white/20 focus:border-primary outline-none text-sm text-white py-1 transition-colors placeholder:text-slate-600 caret-primary"
        />
      </td>

      {/* Type Dropdown */}
      <td className="px-4 py-2 text-center">
        <select
          value={local.type}
          onChange={e => handleTypeChange(e.target.value as 'Purchased' | 'Fabricated')}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase outline-none focus:border-primary transition-colors cursor-pointer"
        >
          <option value="Purchased">Purchased [P]</option>
          <option value="Fabricated">Fabricated [F]</option>
        </select>
      </td>

      {/* Total Material Cost */}
      <td className="px-4 py-2">
        <div className="relative flex items-center">
          <span className="absolute left-2 text-primary text-xs font-bold pointer-events-none">₹</span>
          <input
            type="number"
            value={local.totalMaterialCost === 0 ? '' : local.totalMaterialCost}
            onChange={e => setLocal(prev => ({ ...prev, totalMaterialCost: parseFloat(e.target.value) || 0 }))}
            onBlur={handleBlur}
            placeholder="0"
            min="0"
            className="w-full bg-transparent border-b border-white/20 focus:border-primary outline-none text-sm text-white py-1 pl-6 text-right transition-colors placeholder:text-slate-600 caret-primary"
          />
        </div>
      </td>

      {/* Remarks */}
      <td className="px-4 py-2">
        <input
          type="text"
          value={local.remarks}
          onChange={e => setLocal(prev => ({ ...prev, remarks: e.target.value }))}
          onBlur={handleBlur}
          placeholder="e.g. 15% Discount..."
          className="w-full bg-transparent border-b border-white/20 focus:border-primary outline-none text-sm text-white py-1 transition-colors placeholder:text-slate-600 caret-primary"
        />
      </td>

      {/* Date (Automated) Moved above */}

      {/* Delete */}
      <td className="px-4 py-2 text-center">
        <button
          onClick={() => onDelete(row.id)}
          className="p-1.5 text-slate-700 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </motion.tr>
  );
}

interface BOMTableProps {
  teamName: string;
  onClose: () => void;
}

export default function BOMTable({ teamName, onClose }: BOMTableProps) {
  const [rows, setRows] = useState<BOMRow[]>([]);
  const [loading, setLoading] = useState(true);

  const dbPath = `finances/bom/${teamName}`;

  useEffect(() => {
    const bomRef = ref(rtdb, dbPath);
    const unsub = onValue(bomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsed: BOMRow[] = Object.entries(data).map(([id, val]: [string, any]) => ({
          id,
          sno: val.sno,
          category: val.category,
          partName: val.partName || '',
          vendor: val.vendor || '',
          type: val.type || 'Purchased',
          totalMaterialCost: val.totalMaterialCost || 0,
          remarks: val.remarks || '',
          date: val.date || '',
        }));
        setRows(parsed);
      } else {
        setRows([]);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [dbPath]);

  // Auto-sync team total spend from BOM table
  useEffect(() => {
    if (loading) return;
    const total = rows.reduce((sum, r) => sum + (Number(r.totalMaterialCost) || 0), 0);
    const teamTotalRef = ref(rtdb, `finances/teams/${teamName}`);
    set(teamTotalRef, total);
  }, [rows, teamName, loading]);

  const handleSaveRow = useCallback(async (id: string, updated: Omit<BOMRow, 'id'>) => {
    const rowRef = ref(rtdb, `${dbPath}/${id}`);
    await set(rowRef, updated);
  }, [dbPath]);

  const handleAddRow = async () => {
    const bomRef = ref(rtdb, dbPath);
    await push(bomRef, {
      partName: '',
      vendor: '',
      type: 'Purchased',
      totalMaterialCost: 0,
      remarks: '',
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    });
  };

  const handleDeleteRow = async (id: string) => {
    if (!window.confirm('Remove this item?')) return;
    const rowRef = ref(rtdb, `${dbPath}/${id}`);
    await remove(rowRef);
  };

  const totalCost = rows.reduce((sum, r) => sum + (Number(r.totalMaterialCost) || 0), 0);

  const handleExportPDF = () => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill of Materials - ${teamName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 20px; }
          h1 { font-size: 16px; text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
          .subtitle { text-align: center; font-size: 10px; color: #555; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; vertical-align: middle; }
          th { background: #f0f0f0; font-weight: bold; text-transform: uppercase; font-size: 10px; text-align: center; }
          td:nth-child(1), td:nth-child(3), td:nth-child(5) { text-align: center; }
          td:nth-child(6) { text-align: right; }
          tr:nth-child(even) { background: #f9f9f9; }
          .total-row td { font-weight: bold; background: #e8e8e8; }
          .footer { margin-top: 24px; font-size: 9px; color: #888; text-align: right; }
        </style>
      </head>
      <body>
        <h1>ASTRA Solar Car — Bill of Materials</h1>
        <p class="subtitle">Team / Category: ${teamName} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
        <table>
          <thead>
            <tr>
              <th style="width:5%">S.No</th>
              <th style="width:15%">Category</th>
              <th style="width:12%">Date</th>
              <th style="width:23%">Part Name</th>
              <th style="width:15%">Vendor</th>
              <th style="width:5%">P/F</th>
              <th style="width:12%">Cost (₹)</th>
              <th style="width:13%">Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr>
                <td>${r.sno !== undefined ? r.sno : (i + 1)}</td>
                <td>${r.category !== undefined ? r.category : teamName}</td>
                <td style="text-align:center">${r.date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
                <td>${r.partName || ''}</td>
                <td>${r.vendor || ''}</td>
                <td style="text-align:center">${r.type === 'Purchased' ? 'P' : 'F'}</td>
                <td style="text-align:right">${Number(r.totalMaterialCost || 0).toLocaleString('en-IN')}</td>
                <td>${r.remarks || ''}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="6" style="text-align:right; font-weight:bold; text-transform:uppercase; letter-spacing:1px">TOTAL COST</td>
              <td style="text-align:right">&#8377;${totalCost.toLocaleString('en-IN')}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p class="footer">ASTRA Platform — Auto-generated BOM Report</p>
      </body>
      </html>
    `;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.write(printContent);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 400);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 border border-primary/20 rounded-[2rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_0_60px_rgba(var(--primary-rgb),0.15)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-2xl">
              <FileText className="text-primary" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Bill of Materials</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary mt-0.5">
                {teamName} • Financial Intelligence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20"
            >
              <Download size={14} />
              Export PDF
            </button>
            <button
              onClick={onClose}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto p-6 scrollbar-hide">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
              Loading...
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 text-[9px] font-black uppercase text-slate-500 tracking-widest">
                    <th className="px-4 py-3 border-b border-white/5 text-center w-10">S.No</th>
                    <th className="px-4 py-3 border-b border-white/5 w-28">Category</th>
                    <th className="px-4 py-3 border-b border-white/5 w-24 text-center">Date</th>
                    <th className="px-4 py-3 border-b border-white/5">Part Name</th>
                    <th className="px-4 py-3 border-b border-white/5 w-32">Vendor</th>
                    <th className="px-4 py-3 border-b border-white/5 w-40 text-center">Purchased / Fabricated</th>
                    <th className="px-4 py-3 border-b border-white/5 w-36 text-right">Total Material Cost (₹)</th>
                    <th className="px-4 py-3 border-b border-white/5 w-44">Remarks</th>
                    <th className="px-4 py-3 border-b border-white/5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence>
                    {rows.map((row, index) => (
                      <EditableRow
                        key={row.id}
                        row={row}
                        index={index}
                        teamName={teamName}
                        onSave={handleSaveRow}
                        onDelete={handleDeleteRow}
                      />
                    ))}
                  </AnimatePresence>
                </tbody>
                {/* Total Row */}
                <tfoot>
                  <tr className="bg-primary/5 border-t border-primary/20">
                    <td colSpan={6} className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                      Total Cost
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-black text-primary">
                      ₹{totalCost.toLocaleString('en-IN')}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Add Row Button */}
        <div className="p-6 border-t border-white/5 flex-shrink-0">
          <button
            onClick={handleAddRow}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-dashed border-white/20 hover:border-primary/50 hover:bg-primary/5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-all w-full justify-center"
          >
            <Plus size={14} />
            Add Item
          </button>
        </div>
      </motion.div>
    </div>
  );
}
