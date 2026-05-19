"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface GrowthData {
  fecha: string;
  total: number;
}

export default function GrowthChart({ data }: { data: GrowthData[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-gray-400 font-medium">
        No hay datos suficientes para mostrar
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 10,
            left: -20,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="fecha" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} 
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} 
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.8)', 
              backdropFilter: 'blur(8px)',
              borderRadius: '16px', 
              border: '1px solid rgba(255, 255, 255, 0.5)', 
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.05)',
              padding: '12px'
            }}
            labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
            itemStyle={{ fontWeight: '600', color: '#2563eb' }}
            formatter={(value: any) => [`${value} contactos`, 'Registros']}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#2563eb"
            strokeWidth={4}
            fillOpacity={1}
            fill="url(#colorTotal)"
            activeDot={{ r: 8, strokeWidth: 2, stroke: '#ffffff', fill: '#2563eb' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
