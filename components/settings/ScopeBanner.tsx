import { Building2, Shield, User2 } from 'lucide-react'
import { SetupScope, getScopeDescription, getScopeTitle, getRoleScopeBadges } from '@/lib/setup-scope'
import { Role } from '@/types/database'

interface Props {
  scope: SetupScope
  role: Role
  churchName?: string | null
  isSystemAdmin?: boolean
}

export function ScopeBanner({ scope, role, churchName, isSystemAdmin = false }: Props) {
  const badges = getRoleScopeBadges(role, isSystemAdmin)
  const Icon = scope === 'my' ? User2 : scope === 'church' ? Building2 : Shield
  const tint = scope === 'my'
    ? 'bg-slate-50 border-slate-200 text-slate-700'
    : scope === 'church'
      ? 'bg-violet-50 border-violet-200 text-violet-700'
      : 'bg-amber-50 border-amber-200 text-amber-700'

  return (
    <section className={`border rounded-2xl p-4 sm:p-5 mb-6 ${tint}`}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white/80 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-base font-semibold text-slate-900">You are editing: {getScopeTitle(scope)}</h2>
            {badges.map(badge => (
              <span key={badge} className="text-[11px] px-2 py-0.5 rounded-full bg-white/80 border border-current/10">
                {badge}
              </span>
            ))}
          </div>
          <p className="text-sm text-slate-600">{getScopeDescription(scope, churchName)}</p>
        </div>
      </div>
    </section>
  )
}
