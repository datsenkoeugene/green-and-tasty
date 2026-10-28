import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { SubmittedDish } from '@app/models/group-orders/submit-group-pre-order.model';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';

@Injectable({
  providedIn: 'root',
})
export class GroupOrdersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL, { optional: true }) || '';

  private url(path: string): string {
    if (path.startsWith('http')) return path;
    return `${this.baseUrl}${path}`;
  }

  getInviteToken(reservationId: string): Observable<{ token: string }> {
    return this.http.get<{ token: string }>(this.url(`/reservations/${reservationId}/invite-token`));
  }

  getInviteByToken(token: string): Observable<GuestInvite> {
    return this.http.get<GuestInvite>(this.url(`/guest/invites/${token}`));
  }

  getGuestSessionId(reservationId: string): Observable<{ guestSessionId: string }> {
    return this.http.get<{ guestSessionId: string }>(this.url(`/reservations/${reservationId}/guest-session-id`));
  }

  getOwnerSessionId$(reservationId: string): Observable<string> {
    return new Observable<string>((observer) => {
      this.http
        .get<{ guestSessionId: string }>(this.url(`/reservations/${reservationId}/guest-session-id`))
        .subscribe({
          next: (res) => observer.next(res.guestSessionId),
          error: (err) => observer.error(err),
          complete: () => observer.complete(),
        });
    });
  }

  getSessions(groupReservationId: string, options?: { silent?: boolean }): Observable<GroupSessionsResponse> {
    const context = new HttpContext();
    if (options?.silent) {
      context.set(SKIP_ERROR_TOAST, true);
    }
    return this.http.get<GroupSessionsResponse>(this.url(`/guest/groups/${groupReservationId}/sessions`), { context });
  }

  getSessions$(groupReservationId: string, options?: { silent?: boolean }): Observable<GroupSessionsResponse> {
    return this.getSessions(groupReservationId, options);
  }

  getStatus(groupReservationId: string, options?: { silent?: boolean }): Observable<GroupStatusResponse> {
    const context = new HttpContext();
    if (options?.silent) {
      context.set(SKIP_ERROR_TOAST, true);
    }
    return this.http.get<GroupStatusResponse>(this.url(`/guest/groups/${groupReservationId}/status`), { context });
  }

  getStatus$(groupReservationId: string, options?: { silent?: boolean }): Observable<GroupStatusResponse> {
    return this.getStatus(groupReservationId, options);
  }

  submit(groupReservationId: string, reservationId: string): Observable<SubmittedDish[]> {
    return this.http.post<SubmittedDish[]>(this.url(`/group-reservations/${groupReservationId}/submit`), {
      reservationId,
    });
  }

  submit$(groupReservationId: string, reservationId: string): Observable<SubmittedDish[]> {
    return this.submit(groupReservationId, reservationId);
  }

  getGroupInvite$(reservationId: string): Observable<GuestInvite> {
    return this.getInviteToken(reservationId).pipe(
      switchMap((tokenRes) => this.getInviteByToken(tokenRes.token))
    );
  }
}
