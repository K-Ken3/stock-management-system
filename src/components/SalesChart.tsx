import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

type Props = {
  data: { day: string; sales: number }[]
  formatAmount: (amount: number) => string
}

export default function SalesChart({ data, formatAmount }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b36b52" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#b36b52" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#eee9e2" strokeDasharray="3 5" />
        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#99928a', fontSize: 11 }} dy={10} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#99928a', fontSize: 10 }} tickFormatter={(value: number) => value === 0 ? '0' : `${Math.round(value / 1000)}k`} />
        <Tooltip formatter={(value) => formatAmount(Number(value))} contentStyle={{ border: '1px solid #ece6df', borderRadius: 10, fontSize: 12 }} />
        <Area type="monotone" dataKey="sales" stroke="#a86149" strokeWidth={2.5} fill="url(#salesFill)" activeDot={{ r: 4, fill: '#a86149' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
