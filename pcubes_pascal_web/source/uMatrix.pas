unit uMatrix;
interface
uses uVector;
type
  T4x4Matrix = array[0..3,0..3] of extended;
  TMatrix = class
  public
    class function SingleMatrix:T4x4Matrix;
    class function GetMoveMatrix(const d:TVector):T4x4Matrix;
    class function GetRotateMatrix(nx,ny,nz,Al:extended):T4x4Matrix; overload;
    class function GetRotateMatrix(const V:TVector;Al:extended):T4x4Matrix; overload;
    class function GetScaleMatrix(dx,dy,dz:extended):T4x4Matrix;
    class function Mult(const a,b:T4x4Matrix):T4x4Matrix;
    class function VectorMul(const a:T4x4Matrix;const V:TVector):TVector;
  end;
implementation
uses SysUtils;
const FSingleMatrix:T4x4Matrix=((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1));
class function TMatrix.Mult(const a,b:T4x4Matrix):T4x4Matrix;
var i,j,k:integer; s:extended;
begin
  for j:=0 to 3 do for i:=0 to 3 do begin
    s:=0; for k:=0 to 3 do s:=s+a[j,k]*b[k,i]; Result[j,i]:=s;
  end;
end;
class function TMatrix.VectorMul(const a:T4x4Matrix;const V:TVector):TVector;
var a1,a2,a3,d:extended;
begin
  a1:=V.X*a[0,0]+V.Y*a[1,0]+V.Z*a[2,0]+a[3,0];
  a2:=V.X*a[0,1]+V.Y*a[1,1]+V.Z*a[2,1]+a[3,1];
  a3:=V.X*a[0,2]+V.Y*a[1,2]+V.Z*a[2,2]+a[3,2];
  d:=V.X*a[0,3]+V.Y*a[1,3]+V.Z*a[2,3]+a[3,3];
  if d<>0 then begin Result.X:=a1/d; Result.Y:=a2/d; Result.Z:=a3/d; end
  else begin Result.X:=0; Result.Y:=0; Result.Z:=0; end;
end;
class function TMatrix.SingleMatrix:T4x4Matrix;
begin Result:=FSingleMatrix; end;
class function TMatrix.GetScaleMatrix(dx,dy,dz:extended):T4x4Matrix;
begin Result:=FSingleMatrix; Result[0,0]:=dx; Result[1,1]:=dy; Result[2,2]:=dz; end;
class function TMatrix.GetMoveMatrix(const d:TVector):T4x4Matrix;
begin Result:=FSingleMatrix; Result[3,0]:=d.x; Result[3,1]:=d.y; Result[3,2]:=d.z; end;
class function TMatrix.GetRotateMatrix(nx,ny,nz,Al:extended):T4x4Matrix;
var s,c,t:extended;
begin
  s:=sin(Al); c:=cos(Al); t:=1-c; Result:=FSingleMatrix;
  Result[0,0]:=t*nx*nx+c; Result[1,0]:=t*nx*ny-s*nz; Result[2,0]:=t*nx*nz+s*ny;
  Result[0,1]:=t*nx*ny+s*nz; Result[1,1]:=t*ny*ny+c; Result[2,1]:=t*ny*nz-s*nx;
  Result[0,2]:=t*nx*nz-s*ny; Result[1,2]:=t*nz*ny+s*nx; Result[2,2]:=t*nz*nz+c;
end;
class function TMatrix.GetRotateMatrix(const V:TVector;Al:extended):T4x4Matrix;
var s,c,t:extended;
begin
  s:=sin(Al); c:=cos(Al); t:=1-c; Result:=FSingleMatrix;
  Result[0,0]:=t*V.X*V.X+c; Result[1,0]:=t*V.X*V.Y-s*V.Z; Result[2,0]:=t*V.X*V.Z+s*V.Y;
  Result[0,1]:=t*V.X*V.Y+s*V.Z; Result[1,1]:=t*V.Y*V.Y+c; Result[2,1]:=t*V.Y*V.Z-s*V.X;
  Result[0,2]:=t*V.X*V.Z-s*V.Y; Result[1,2]:=t*V.Z*V.Y+s*V.X; Result[2,2]:=t*V.Z*V.Z+c;
end;
end.