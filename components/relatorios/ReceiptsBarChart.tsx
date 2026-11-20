'use client';

import React, { useState } from 'react';
import { formatCents } from '@/lib/formatters';
import { PeriodBucket, GroupingGranularity } from '@/lib/reports/aggregate';

interface ReceiptsBarChartProps {
  buckets: PeriodBucket[];
  granularity: GroupingGranularity;
  onSelectBucket: (bucket: PeriodBucket) => void;
}

export function ReceiptsBarChart({
  buckets,
  granularity,
  onSelectBucket,
}: ReceiptsBarChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (buckets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-xs text-slate-500">
        Nenhum dia válido no intervalo selecionado.
      </div>
    );
  }

  const maxTotalCents = buckets.reduce((max, b) => Math.max(max, b.totalCents), 0);
  const safeMax = maxTotalCents > 0 ? maxTotalCents : 10000; // R$ 100,00 de escala base quando zerado

  const chartHeight = 190;
  const topPad = 14;
  const bottomPad = 28;
  const usableHeight = chartHeight - topPad - bottomPad;

  // Largura adaptativa para muitos dias (ex: mês completo) sem comprimir demais os rótulos
  const barSlotWidth = buckets.length > 20 ? 28 : buckets.length > 10 ? 44 : 68;
  const minSvgWidth = Math.max(520, buckets.length * barSlotWidth + 24);
  const barWidth = Math.min(34, Math.max(14, Math.floor(barSlotWidth * 0.56)));

  const hoveredBucket = buckets.find(b => b.key === hoveredKey) || null;

  return (
    <div className="space-y-3">
      {/* Legenda e leitura rápida do item em foco */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-800 inline-block" />
            <span className="font-medium text-slate-700">Bar e cozinha</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-xs bg-sky-600 inline-block" />
            <span className="font-medium text-slate-700">Locações de quadras</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Clique em uma barra para conferir os lançamentos
          </span>
        </div>

        <div className="min-h-5 text-[11px] text-slate-600 tabular-nums">
          {hoveredBucket ? (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-800">
              <strong className="text-slate-950">{hoveredBucket.label}:</strong>
              <span>Bar {formatCents(hoveredBucket.comandasCents)}</span>
              <span className="text-slate-400">·</span>
              <span>Locações {formatCents(hoveredBucket.locacoesCents)}</span>
              <span className="text-slate-400">·</span>
              <strong className="text-emerald-900">
                Total {formatCents(hoveredBucket.totalCents)}
              </strong>
            </span>
          ) : (
            <span className="text-slate-400">
              {granularity === 'dia'
                ? 'Passe o mouse ou toque em um dia para detalhar'
                : granularity === 'semana'
                ? 'Agrupamento semanal (segunda a domingo)'
                : 'Agrupamento mensal no período selecionado'}
            </span>
          )}
        </div>
      </div>

      {/* Gráfico SVG com rolagem horizontal segura no mobile e meses completos */}
      <div className="overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${minSvgWidth} ${chartHeight}`}
          className="w-full min-w-[520px] h-52 select-none"
          role="img"
          aria-label="Gráfico de barras de recebimentos por período"
        >
          {/* Linhas de referência horizontais (0%, 50%, 100%) */}
          {[0, 0.5, 1].map(ratio => {
            const y = topPad + usableHeight * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={8}
                y1={y}
                x2={minSvgWidth - 8}
                y2={y}
                stroke={ratio === 0 ? '#cbd5e1' : '#e2e8f0'}
                strokeDasharray={ratio === 0 ? undefined : '3 3'}
                strokeWidth={1}
              />
            );
          })}

          {buckets.map((bucket, idx) => {
            const slotCenter = 12 + idx * barSlotWidth + barSlotWidth / 2;
            const barX = slotCenter - barWidth / 2;

            const totalHeight =
              maxTotalCents > 0
                ? Math.round((bucket.totalCents / safeMax) * usableHeight)
                : 0;
            const comandasHeight =
              maxTotalCents > 0
                ? Math.round((bucket.comandasCents / safeMax) * usableHeight)
                : 0;
            const locacoesHeight = Math.max(0, totalHeight - comandasHeight);

            const baseY = topPad + usableHeight;
            const comandasY = baseY - comandasHeight;
            const locacoesY = comandasY - locacoesHeight;
            const isHovered = hoveredKey === bucket.key;

            return (
              <g
                key={bucket.key}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredKey(bucket.key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => onSelectBucket(bucket)}
                role="button"
                tabIndex={0}
                aria-label={`${bucket.label}: total ${formatCents(bucket.totalCents)}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectBucket(bucket);
                  }
                }}
              >
                {/* Área clicável confortável */}
                <rect
                  x={slotCenter - barSlotWidth / 2}
                  y={topPad}
                  width={barSlotWidth}
                  height={usableHeight + bottomPad}
                  fill={isHovered ? '#f1f5f9' : 'transparent'}
                  rx={6}
                />

                {/* Barra vazia discreta para dias sem movimento */}
                {bucket.totalCents === 0 && (
                  <rect
                    x={barX}
                    y={baseY - 2}
                    width={barWidth}
                    height={2}
                    fill="#cbd5e1"
                    rx={1}
                  />
                )}

                {/* Parte 1 (base): Bar e cozinha */}
                {comandasHeight > 0 && (
                  <rect
                    x={barX}
                    y={comandasY}
                    width={barWidth}
                    height={comandasHeight}
                    fill={isHovered ? '#064e3b' : '#065f46'}
                    rx={locacoesHeight === 0 ? 4 : 0}
                  />
                )}

                {/* Parte 2 (topo): Locações de quadras */}
                {locacoesHeight > 0 && (
                  <rect
                    x={barX}
                    y={locacoesY}
                    width={barWidth}
                    height={locacoesHeight}
                    fill={isHovered ? '#0369a1' : '#0284c7'}
                    rx={4}
                  />
                )}

                {/* Rótulo do eixo X */}
                <text
                  x={slotCenter}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  fontSize={buckets.length > 20 ? 9 : 10}
                  fontWeight={isHovered ? 700 : 500}
                  fill={isHovered ? '#0f172a' : '#64748b'}
                >
                  {bucket.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
