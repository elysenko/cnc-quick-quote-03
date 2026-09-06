import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Query-param driven dialog shell. Docks to the bottom of the screen on handsets. */
@Component({
  selector: 'app-modal',
  standalone: true,
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  readonly title = input.required<string>();
  readonly dismiss = output<void>();

  backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.dismiss.emit();
  }
}
