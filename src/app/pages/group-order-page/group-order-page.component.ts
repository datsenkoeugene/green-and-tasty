import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { catchError, exhaustMap, finalize, forkJoin, interval, of, startWith, Subject, switchMap, takeUntil } from 'rxjs';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { ToastService } from '@app/services/toast/toast.service';

@Component({
  selector: 'app-group-order-page',
  imports: [ParticipantCardComponent, CurrencyPipe, DatePipe, ModalComponent],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly groupOrdersService = inject(GroupOrdersService);
  private readonly toastService = inject(ToastService);
  private readonly destroy$ = new Subject<void>();
  private syncStarted = false;

  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';

  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly isSubmitted = signal(false);

  readonly participants = signal<any[]>([]);
  readonly invite = signal<any>(null);
  readonly groupReservationId = signal<string>('');
  readonly guestSessionId = signal<string>('');
  readonly groupStatus = signal<'Open' | 'Submitted' | 'Closed'>('Open');

  readonly showConfirmModal = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  readonly syncError = signal<string | null>(null);

  readonly myParticipant = computed(() => {
    const id = this.guestSessionId();
    return this.participants().find((p) => p.id === id);
  });

  readonly otherParticipants = computed(() => {
    const id = this.guestSessionId();
    return this.participants().filter((p) => p.id !== id);
  });

  readonly orderedParticipants = computed(() => {
    const mine = this.myParticipant();
    const others = this.otherParticipants();
    if (mine) return [mine, ...others];
    return this.participants();
  });

  readonly consolidated = computed(() => consolidatePreOrder(this.participants() as any));
  readonly grandTotal = computed(() => this.consolidated().total);

  readonly hasUnsubmitted = computed(() => {
    if (this.isSubmitted() || this.groupStatus() === 'Submitted') return false;
    return this.participants().some((p) => !p.isSubmitted);
  });

  readonly unsubmittedCount = computed(() => {
    if (this.isSubmitted() || this.groupStatus() === 'Submitted') return 0;
    return this.participants().filter((p) => !p.isSubmitted).length;
  });

  readonly canSubmit = computed(() => {
    if (this.isSubmitted() || this.isSubmitting()) return false;
    if (this.groupStatus() !== 'Open') return false;
    const submitted = this.participants().filter((p) => p.isSubmitted);
    if (submitted.length === 0) return false;
    const hasDishes = submitted.some((p) => p.items && p.items.length > 0);
    return hasDishes;
  });

  constructor() {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private startSync(): void {
    if (this.syncStarted) return;
    if (this.isSubmitted() || this.groupStatus() === 'Submitted') return;
    this.syncStarted = true;
    interval(15000)
      .pipe(
        takeUntil(this.destroy$),
        exhaustMap(() => {
          const groupId = this.groupReservationId();
          if (!groupId) return of(null);
          if (this.isSubmitted() || this.groupStatus() === 'Submitted') {
            this.destroy$.next();
            return of(null);
          }
          return forkJoin({
            sessions: this.groupOrdersService.getSessions$(groupId, { silent: true }),
            status: this.groupOrdersService.getStatus$(groupId, { silent: true }),
          }).pipe(
            catchError(() => {
              this.syncError.set("Couldn't refresh. Showing data from …");
              return of(null);
            })
          );
        })
      )
      .subscribe((result) => {
        if (!result) return;
        this.syncError.set(null);
        this.participants.set(result.sessions.participants || []);
        this.groupStatus.set(result.status.status);
        if (result.status.status === 'Submitted') {
          this.isSubmitted.set(true);
          this.destroy$.next();
        }
        this.lastUpdated.set(new Date());
      });
  }

  refreshNow(): void {
    const groupId = this.groupReservationId();
    if (!groupId) return;
    if (this.isSubmitted() || this.groupStatus() === 'Submitted') return;
    forkJoin({
      sessions: this.groupOrdersService.getSessions$(groupId, { silent: true }),
      status: this.groupOrdersService.getStatus$(groupId, { silent: true }),
    })
      .pipe(
        catchError(() => {
          this.syncError.set("Couldn't refresh. Showing data from …");
          return of(null);
        })
      )
      .subscribe((result) => {
        if (!result) return;
        this.syncError.set(null);
        this.participants.set(result.sessions.participants || []);
        this.groupStatus.set(result.status.status);
        if (result.status.status === 'Submitted') {
          this.isSubmitted.set(true);
          this.destroy$.next();
        }
        this.lastUpdated.set(new Date());
      });
  }

  loadData(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.groupOrdersService
      .getGroupInvite$(this.reservationId)
      .pipe(
        switchMap((invite) =>
          forkJoin({
            invite: of(invite),
            guestSessionId: this.groupOrdersService.getOwnerSessionId$(this.reservationId),
          })
        ),
        switchMap((data) => {
          this.invite.set(data.invite);
          this.guestSessionId.set(typeof data.guestSessionId === 'string' ? data.guestSessionId : (data.guestSessionId as any).guestSessionId);
          this.groupReservationId.set(data.invite.GroupReservationId);
          return forkJoin({
            sessions: this.groupOrdersService.getSessions$(data.invite.GroupReservationId),
            status: this.groupOrdersService.getStatus$(data.invite.GroupReservationId),
          });
        }),
        catchError((err) => {
          this.error.set(err?.error?.error || err?.message || 'Error');
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe((result) => {
        if (!result) return;
        this.participants.set(result.sessions.participants || []);
        this.groupStatus.set(result.status.status);
        if (result.status.status === 'Submitted') {
          this.isSubmitted.set(true);
        }
        this.lastUpdated.set(new Date());
        this.isLoading.set(false);
        this.startSync();
      });
  }

  retry(): void {
    this.loadData();
  }

  openConfirm(): void {
    if (!this.canSubmit()) return;
    this.showConfirmModal.set(true);
  }

  cancelConfirm(): void {
    this.showConfirmModal.set(false);
  }

  confirmSubmit(): void {
    this.showConfirmModal.set(false);
    this.isSubmitting.set(true);
    this.groupOrdersService
      .submit$(this.groupReservationId(), this.reservationId)
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        catchError((err) => {
          return of(null);
        })
      )
      .subscribe((res) => {
        if (res !== null) {
          this.toastService.success('Pre-order sent to the restaurant');
          this.isSubmitted.set(true);
          this.groupStatus.set('Submitted');
          this.destroy$.next();
        }
      });
  }
}
