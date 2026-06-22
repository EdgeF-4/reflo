import { Injectable } from '@nestjs/common';
import { formatCents } from '@reflo/domain';
import { AiService } from './ai.service';
import { ReportsService } from '../reports/reports.service';
import { AuthContext } from '../auth/auth-context';

interface PartnerRow {
  name: string;
  status: string;
  owed_cents: string;
  paid_cents: string;
  conversions: string;
}

@Injectable()
export class InsightsService {
  constructor(
    private readonly ai: AiService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Partner performance insights. Builds the same deterministic summary either
   * way; if a model is configured it also adds a natural-language narrative, so
   * the endpoint is useful with or without a key.
   */
  async partnerInsights(auth: AuthContext) {
    const partners = (await this.reports.partners(auth)) as unknown as PartnerRow[];
    const summary = await this.reports.summary(auth);

    const ranked = [...partners].sort((a, b) => Number(b.paid_cents) - Number(a.paid_cents));
    const top = ranked[0];
    const bullets: string[] = [];
    if (top && Number(top.paid_cents) > 0) {
      bullets.push(`${top.name} leads on settled commission at ${formatCents(Number(top.paid_cents))}.`);
    }
    const idle = partners.filter((p) => Number(p.conversions) === 0);
    if (idle.length) {
      bullets.push(`${idle.length} partner(s) have no attributed conversions yet and may need activation.`);
    }
    if (summary.flaggedConversions > 0) {
      bullets.push(`${summary.flaggedConversions} conversion(s) are held for fraud review before payout.`);
    }
    bullets.push(`Outstanding liability across all partners is ${formatCents(summary.owedCents)}, with ${formatCents(summary.payableCents)} ready to pay.`);

    const facts = partners
      .map((p) => `${p.name}: paid ${formatCents(Number(p.paid_cents))}, owed ${formatCents(Number(p.owed_cents))}, ${p.conversions} conversions`)
      .join('\n');

    const narrative = await this.ai.chat(
      'You are a partnerships analyst. Be concise and specific. Do not invent numbers.',
      `Given these partner figures, write three short, actionable observations for the program manager:\n${facts}`,
    );

    return {
      generatedBy: narrative ? 'model' : 'rules',
      headline: bullets,
      narrative,
      partners: ranked,
    };
  }
}
