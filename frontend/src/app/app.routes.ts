import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing.component').then((m) => m.LandingComponent) },
  { path: 'create', loadComponent: () => import('./features/create-room/create-room.component').then((m) => m.CreateRoomComponent) },
  { path: 'join', loadComponent: () => import('./features/join-room/join-room.component').then((m) => m.JoinRoomComponent) },
  { path: 'room/:code', loadComponent: () => import('./features/room-page/room-page.component').then((m) => m.RoomPageComponent) },
  { path: '**', redirectTo: '' },
];
