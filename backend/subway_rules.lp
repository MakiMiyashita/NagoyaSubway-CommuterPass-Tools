#include "setting/station.lp". %各駅名と隣接情報
#include "setting/zone.lp". %料金区間情報

#const transfer_limit = 3. %乗り換え回数上限
#const complex_limit = 5. %経路・接続号線判別駅上限

% --- 経路作成 ---
{chosen(X,Y,Dist,Line); chosen(Y,X,Dist,Line)} 1 :- adj(X,Y,Dist,Line).
chosen(X,Y) :- chosen(X,Y,_,_).

% --- 連結制約 ---
{start(X) : chosen(X,Y)} = 1.
goal(G) :- chosen(_,G), not chosen(G,_).
:- start(S), goal(G), S > G.


reached(X) :- start(X).
reached(Y) :- reached(X), chosen(X,Y).
:- chosen(X,Y), not reached(X).

% --- 一筆書き制約 ---
:- station(Y,_), 2 {chosen(X,Y)}.
:- station(X,_), 2 {chosen(X,Y)}.
:- reached(X), reached(Y), X < Y,
    station(X,Name), station(Y,Name),
    not chosen(X,Y), not chosen(Y,X). %路線の異なる同名の駅の重複使用禁止

% --- 要求 ---
visited(Name) :- reached(No), station(No,Name).
satisfied(Name) :- request(Name,soft), visited(Name).
:- request(Name,hard), not visited(Name).
warning("request is not satisfied", Name) :- request(Name,soft), not satisfied(Name).
:- endpoint(Name), #count {X,Y : station(X,Name), chosen(X,Y); X,Y : station(X,Name), chosen(Y,X)} != 1.
:- avoid(Name), visited(Name).

% --- 乗り換え制約 ---
transfers(N) :- N = #count {X,Y : chosen(X,Y,_,transfer) }.
complex_pts(N) :- N = #count {Name : reached(X), station(X,Name), determination(Name)}.
:- transfers(T), transfer_limit < T.
warning("Route too complex", T+D) :- transfers(T), complex_pts(D), complex_limit < T + D.

% --- 料金区間判定 ---
zone(Z) :- L = #sum{Dist,X,Y: chosen(X,Y,Dist,_)}, zone_class(Z,Min,Max), Min <= L, L< Max.
:- zone(Z), budget(LB,UB), UB < Z.
:- zone(Z), budget(LB,UB), Z < LB.
#show chosen/2.
#show zone/1.
#show warning/2.
#show satisfied/1.
