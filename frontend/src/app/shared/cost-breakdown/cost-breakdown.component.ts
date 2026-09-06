import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Breakdown, centsToUsd } from '../../core/models';

/** Itemized quote pricing: setup, cutting, material, handling, bends, minimum order. */
@Component({
  selector: 'app-cost-breakdown',
  standalone: true,
  templateUrl: './cost-breakdown.component.html',
  styleUrl: './cost-breakdown.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CostBreakdownComponent {
  readonly breakdown = input.required<Breakdown>();
  readonly money = centsToUsd;
}
