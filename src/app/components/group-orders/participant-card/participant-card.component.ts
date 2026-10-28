import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Participant } from '@app/models/group-orders/participant.model';

@Component({
  selector: 'app-participant-card',
  imports: [CurrencyPipe],
  templateUrl: './participant-card.component.html',
  styleUrl: './participant-card.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ParticipantCardComponent {
  readonly participant = input.required<Participant>();
  readonly isMyPreOrder = input<boolean>(false);
  readonly readOnly = input<boolean>(false);

  readonly title = computed(() => {
    const person = this.participant();
    if (this.isMyPreOrder()) {
      return person.type === 'Owner' ? 'My Pre-Order' : `My Pre-Order: ${person.name}`;
    }
    return person.type === 'Owner' ? `Owner: ${person.name}` : `Guest: ${person.name}`;
  });
}
