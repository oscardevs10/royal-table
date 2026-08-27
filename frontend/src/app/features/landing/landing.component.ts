import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  readonly isStaticDemo = window.location.hostname.endsWith('github.io');

  constructor(private router: Router) {}

  goToJoin(codeInput: HTMLInputElement): void {
    const code = codeInput.value.trim().toUpperCase();
    this.router.navigate(['/join'], code ? { queryParams: { code } } : {});
  }
}
